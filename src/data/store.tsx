import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Contact, Pensee } from './types';
import { seedContacts, seedPensees } from './seed';
import { normalizePensee, occurrenceYear } from './calendar';
import { resolveBootData } from './storeInit';
import {
  Outbox,
  OutboxOp,
  drainOutbox,
  enqueueDeleteContact,
  enqueueDeletePensee,
  enqueueUpsertContact,
  enqueueUpsertPensee,
  migrateLegacyPendingDeletes,
} from './outbox';
import { generateId } from '../lib/id';
import { rescheduleAllReminders, cancelAllReminders, getNotificationPermissionStatus } from '../lib/notifications';
import { isSupabaseConfigured } from '../lib/supabase';
import { subscribeToConnectivityRestored } from '../lib/netInfo';
import { clearMessageDraftForEvent, clearMessageDraftsForContact } from './messageDraftStorage';
import {
  deleteContactRemote,
  deletePenseeRemote,
  ensureAnonSession,
  insertContactRemote,
  insertPenseeRemote,
  loadRemoteData,
  updateContactRemote,
  updatePenseeRemote,
} from '../lib/supabaseRepo';

const KEYS = {
  contacts: 'pensif.contacts',
  pensees: 'pensif.pensees',
  userName: 'pensif.userName',
  themePref: 'pensif.themePref',
  notificationsEnabled: 'pensif.notificationsEnabled',
  outbox: 'pensif.outbox',
  // Legacy (CHANTIER SYNC OFFLINE→SUPABASE) : lues une seule fois au boot pour migration vers
  // l'outbox (voir migrateLegacyPendingDeletes), plus jamais écrites ensuite.
  pendingDeleteContacts: 'pensif.pendingDeleteContacts',
  pendingDeletePensees: 'pensif.pendingDeletePensees',
};

export type ThemePref = 'system' | 'light' | 'dark';

type Store = {
  ready: boolean;
  today: Date;
  contacts: Contact[];
  pensees: Pensee[];
  userName: string | null;
  giftSentIds: string[];
  namePromptOpen: boolean;
  openNamePrompt: () => void;
  setUserName: (name: string) => void;
  upsertContact: (contact: Contact) => void;
  deleteContact: (contactId: string) => void;
  addPensee: (pensee: Omit<Pensee, 'id'>) => void;
  updatePensee: (pensee: Pensee) => void;
  deletePensee: (penseeId: string) => void;
  toggleGiftSent: (contactId: string) => void;
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  resetLocalDemoData: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  // Un véritable nouvel utilisateur commence à zéro — les seeds ne servent plus que de données de
  // démo explicites (bouton Réglages en mode local) ou de fixtures pour les scripts de test, jamais
  // d'état initial implicite (voir CHANTIER PRÉ-BÊTA 1 §2).
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pensees, setPensees] = useState<Pensee[]>([]);
  const [userName, setUserNameState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [themePref, setThemePrefState] = useState<ThemePref>('system');
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  // CHANTIER SYNC OFFLINE→SUPABASE : mutations pas encore confirmées côté serveur (create/update/
  // delete, contacts ET pensées) — remplace l'ancien duo pendingDeleteContactIds (explicite, deletes
  // seulement) / diff d'ids au boot (implicite, incapable de représenter une simple modification).
  // Persistée pour survivre à un redémarrage complet de l'app (voir l'effet de persistance plus bas).
  const [outbox, setOutbox] = useState<Outbox>([]);
  // Source de vérité EN MÉMOIRE, tenue à jour de façon SYNCHRONE à chaque enqueue/drain (jamais via
  // un effet réagissant à `outbox`, qui accuserait un cycle de retard sur un `setOutbox` tout juste
  // appelé — un drain déclenché juste après un enqueue doit voir cet enqueue immédiatement).
  // `outbox`/`setOutbox` restent le canal de persistance AsyncStorage + de reactivité React.
  const outboxRef = useRef<Outbox>([]);
  // Empêche deux drains de tourner en parallèle (boot + retour réseau quasi simultanés, etc.) — un
  // drain lit/écrit l'outbox de bout en bout, deux en parallèle pourraient se marcher dessus.
  const drainingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  // BUG SYNC OFFLINE : évite deux tentatives de restauration de session en parallèle (NetInfo et
  // AppState → active peuvent se déclencher quasi simultanément au retour réseau).
  const sessionRestoringRef = useRef(false);

  /** Exécute UNE opération outbox contre Supabase. Toute erreur (réseau ou autre) est traitée de
   *  façon identique : l'opération est conservée pour un prochain essai — Pensif n'a actuellement
   *  aucun moyen fiable de distinguer une vraie erreur applicative d'une coupure réseau, et ce n'est
   *  pas le rôle de ce chantier d'introduire cette classification (voir le §"pas de système complexe
   *  de conflits" de la consigne).
   *
   *  DETTE TECHNIQUE MINEURE (identifiée CHANTIER SUPPRESSION/INTÉGRITÉ, 2026-09-15, volontairement
   *  PAS corrigée maintenant) : si un `insert` (création, `op.isNew`) réussit réellement côté serveur
   *  mais que la réponse réseau est perdue avant que le client ne le sache (coupure juste après
   *  écriture), le retry suivant réutilise le même id client (voir insertContactRemote/
   *  insertPenseeRemote) → conflit de clé primaire → catch ci-dessous → l'op reste dans l'outbox et
   *  est retentée indéfiniment à chaque drain, sans jamais réussir ni jamais dupliquer de ligne (pas
   *  une corruption de données, juste un retry perpétuel inutile). Explicitement PAS traité par un
   *  catch générique "toute violation de clé unique = succès" : ce serait dangereux (masquerait aussi
   *  un vrai conflit d'id entre deux entités distinctes). Une correction correcte nécessiterait de
   *  distinguer précisément ce cas (ex. re-GET par id après un échec d'insert pour vérifier si la
   *  ligne existe déjà ET correspond bien à CETTE création) — pas fait tant qu'aucun cas réel n'est
   *  observé. */
  async function executeOutboxOp(op: OutboxOp): Promise<{ ok: true } | { ok: false }> {
    // Pas de session Supabase établie (jamais bootée en ligne, ou boot hors ligne) : inutile de
    // tenter quoi que ce soit, y compris un update/delete qui n'a pas besoin de userId pour son
    // payload — sans session, la requête serait de toute façon rejetée côté serveur (RLS). Même
    // condition de garde que l'ancien `isSupabaseConfigured && userId` avant l'outbox.
    if (!userIdRef.current) return { ok: false };
    try {
      if (op.kind === 'contact') {
        if (op.action === 'delete') {
          await deleteContactRemote(op.entityId);
        } else if (op.isNew) {
          const { initials, color, ...rest } = op.payload;
          // CHANTIER ROBUSTESSE PRÉ-BÊTA — suppressions (2026-09-16) : NE PLUS réécrire l'état local
          // avec l'objet renvoyé par le serveur ici. `insertContactRemote` ne fait qu'échoïr le
          // payload envoyé (id généré côté client, aucun champ généré serveur — voir supabaseRepo.ts)
          // ; ce `setContacts` était donc à la fois inutile ET dangereux : si une AUTRE mutation (ex.
          // deleteContact d'un proche lié à une pensée pas encore synchronisée) a modifié cette entité
          // localement APRÈS l'enqueue de cette création mais AVANT que ce drain ne s'exécute, réécrire
          // avec ce payload périmé effaçait silencieusement ce changement plus récent. Voir le
          // scénario exact couvert par test-regression-outbox-contact-delete-race.ts.
          await insertContactRemote(userIdRef.current, rest);
        } else {
          await updateContactRemote(op.payload);
        }
      } else {
        if (op.action === 'delete') {
          await deletePenseeRemote(op.entityId);
        } else if (op.isNew) {
          // Même raisonnement que ci-dessus pour les pensées — `insertPenseeRemote` échoïe aussi
          // strictement le payload envoyé (voir supabaseRepo.ts), jamais de champ serveur inconnu du
          // client à rapatrier ici.
          await insertPenseeRemote(userIdRef.current, op.payload);
        } else {
          await updatePenseeRemote(op.payload);
        }
      }
      return { ok: true };
    } catch (e) {
      console.warn('[Pensif] opération outbox échouée, conservée pour un prochain essai', op.kind, op.action, e);
      return { ok: false };
    }
  }

  /** Draine l'outbox — déclenchée au boot connecté, au retour au premier plan (drain de sécurité),
   *  au retour réseau détecté (NetInfo), et juste après chaque enqueue (tentative immédiate). Un
   *  seul drain à la fois (`drainingRef`) ; ne retire de l'outbox QUE les opérations confirmées
   *  réussies entre-temps, jamais un remplacement intégral qui écraserait un enqueue survenu pendant
   *  le drain (voir le commentaire sur `outboxRef` plus haut).
   *
   *  CHANTIER ROBUSTESSE PRÉ-BÊTA — suppressions multiples (2026-09-16) : BOUCLE plutôt qu'un
   *  passage unique. Bug réel trouvé par audit (pas encore rencontré en usage, découvert en
   *  retraçant le chemin d'une suppression multiple) : `drainOutbox` ne traite que la SNAPSHOT prise
   *  au tout début de cet appel. Or une sélection multiple appelle `deletePensee`/`deleteContact` en
   *  boucle SYNCHRONE (`selectedIds.forEach`) — seul le tout PREMIER `enqueueAndDrain` déclenche un
   *  drain réel (`drainingRef` bloque les suivants, qui arrivent pendant que ce premier drain est en
   *  vol) ; ses ops sont enqueuées dans `outboxRef` APRÈS que la snapshot ait déjà été capturée par ce
   *  premier drain. Résultat sans boucle : seule la 1ère entité sélectionnée était réellement
   *  synchronisée immédiatement, les suivantes restaient bloquées dans l'outbox jusqu'au prochain
   *  déclencheur externe (retour au premier plan, retour réseau, prochain boot) — jamais perdues, mais
   *  inutilement retardées. En bouclant tant qu'il reste des opérations ET que le dernier passage n'a
   *  rencontré aucun échec, une seule invocation de `drainNow()` absorbe bien tout ce qui a été
   *  enqueué entre-temps, y compris pendant qu'elle tournait. Un échec réel (`stoppedEarly`) arrête
   *  quand même la boucle immédiatement, exactement comme avant — jamais de tempête de nouvelles
   *  tentatives sur une vraie panne réseau/serveur. */
  async function drainNow() {
    if (!isSupabaseConfigured) return;
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      for (;;) {
        const snapshot = outboxRef.current;
        if (snapshot.length === 0) return;
        const result = await drainOutbox(snapshot, executeOutboxOp);
        const succeededOpIds = new Set(
          snapshot.filter((op) => !result.outbox.some((o) => o.opId === op.opId)).map((op) => op.opId),
        );
        if (succeededOpIds.size > 0) {
          const next = outboxRef.current.filter((op) => !succeededOpIds.has(op.opId));
          outboxRef.current = next;
          setOutbox(next);
        }
        if (result.stoppedEarly) return;
      }
    } finally {
      drainingRef.current = false;
    }
  }

  /** Applique un enqueue (create/update/delete) de façon SYNCHRONE sur `outboxRef`, avant de
   *  répercuter vers l'état React (persistance + re-render) et de tenter un drain immédiat. */
  function enqueueAndDrain(mutate: (prev: Outbox) => Outbox) {
    const next = mutate(outboxRef.current);
    outboxRef.current = next;
    setOutbox(next);
    void drainNow();
  }

  /**
   * BUG SYNC OFFLINE — COLD START : un cold start hors ligne peut échouer à charger `loadRemoteData`
   * (réseau requis) alors que `ensureAnonSession()` réussit (session persistée localement, voir
   * supabase.ts `persistSession: true`) — l'ancien code jetait quand même la session obtenue car il
   * exigeait les deux à la fois (voir le commentaire du bloc de boot plus bas). Si `userIdRef` n'est
   * TOUJOURS pas renseigné (session jamais obtenue, y compris localement — device jamais connecté,
   * ou token expiré nécessitant un vrai refresh réseau), on retente ICI `ensureAnonSession()` avant
   * de drainer. Ne fait RIEN à l'outbox en cas d'échec (elle reste intacte, retentée au prochain
   * déclencheur) ; ne bloque jamais rien d'autre (pas d'await côté appelant).
   */
  async function restoreSessionThenDrain() {
    if (!isSupabaseConfigured) return;
    if (!userIdRef.current) {
      if (sessionRestoringRef.current) return;
      sessionRestoringRef.current = true;
      try {
        const session = await ensureAnonSession();
        if (session) {
          userIdRef.current = session.userId;
          setUserId(session.userId);
        }
      } catch (e) {
        console.warn('[Pensif] session Supabase toujours indisponible — nouvel essai au prochain retour réseau', e);
        return;
      } finally {
        sessionRestoringRef.current = false;
      }
      if (!userIdRef.current) return; // ensureAnonSession a résolu `null` (pas d'exception) — rien à drainer
    }
    void drainNow();
  }

  useEffect(() => {
    (async () => {
      try {
        const [u, t, n] = await Promise.all([
          AsyncStorage.getItem(KEYS.userName),
          AsyncStorage.getItem(KEYS.themePref),
          AsyncStorage.getItem(KEYS.notificationsEnabled),
        ]);
        if (u) setUserNameState(u);
        if (t === 'light' || t === 'dark' || t === 'system') setThemePrefState(t);
        if (n === '0') setNotificationsEnabledState(false);

        // Lu AVANT toute décision Supabase : sert de secours hors-ligne, mais surtout de filet de
        // sécurité — si un ajout précédent n'a jamais fini par atteindre le serveur (requête
        // perdue, colonne manquante, coupure réseau juste après la création…), il ne doit pas
        // disparaître silencieusement au prochain lancement simplement parce que le serveur ne le
        // connaît pas encore.
        const [cachedContactsRaw, cachedPenseesRaw, outboxRaw, legacyPendingDelContactsRaw, legacyPendingDelPenseesRaw] = await Promise.all([
          AsyncStorage.getItem(KEYS.contacts),
          AsyncStorage.getItem(KEYS.pensees),
          AsyncStorage.getItem(KEYS.outbox),
          AsyncStorage.getItem(KEYS.pendingDeleteContacts),
          AsyncStorage.getItem(KEYS.pendingDeletePensees),
        ]);
        const cachedContacts: Contact[] = cachedContactsRaw ? JSON.parse(cachedContactsRaw) : [];
        // normalizePensee comble createdAt/reminderAt absents sur une pensée mise en cache avant
        // CHANTIER PENSÉES V2 (voir calendar.ts) — le reste de l'app ne doit jamais voir l'ancienne
        // forme (remind/customOffsetMinutes, date obligatoire).
        const cachedPensees: Pensee[] = cachedPenseesRaw ? JSON.parse(cachedPenseesRaw).map(normalizePensee) : [];

        // CHANTIER SYNC OFFLINE→SUPABASE : migration ponctuelle des anciennes listes pending-delete
        // vers l'outbox, pour ne perdre aucune suppression déjà en attente. Idempotente (un id déjà
        // représenté dans l'outbox n'est jamais dupliqué) — les deux clés legacy ne sont plus jamais
        // réécrites après ce boot, elles peuvent rester à zéro dans AsyncStorage sans conséquence.
        let loadedOutbox: Outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
        const legacyPendingDelContacts: string[] = legacyPendingDelContactsRaw ? JSON.parse(legacyPendingDelContactsRaw) : [];
        const legacyPendingDelPensees: string[] = legacyPendingDelPenseesRaw ? JSON.parse(legacyPendingDelPenseesRaw) : [];
        if (legacyPendingDelContacts.length || legacyPendingDelPensees.length) {
          loadedOutbox = migrateLegacyPendingDeletes(
            loadedOutbox,
            legacyPendingDelContacts,
            legacyPendingDelPensees,
            generateId,
            new Date().toISOString(),
          );
        }
        outboxRef.current = loadedOutbox;
        setOutbox(loadedOutbox);

        // Le cache local est déjà lu à ce stade (cachedContacts/cachedPensees ci-dessus) : il sert
        // de repli garanti quel que soit le sort de l'appel Supabase — voir resolveBootData
        // (storeInit.ts) et CHANTIER PRÉ-BÊTA 1 §1.
        //
        // BUG SYNC OFFLINE — COLD START : `ensureAnonSession()` et `loadRemoteData()` ont CHACUN
        // leur propre try/catch, et surtout ne sont PLUS jamais conditionnés l'un à l'autre pour
        // renseigner `userIdRef` : `ensureAnonSession()` peut réussir hors ligne (session persistée
        // localement, voir supabase.ts) alors que `loadRemoteData()` échoue forcément (vraie requête
        // réseau) — l'ancien code exigeait les deux (`if (remote && sessionUserId)`) et jetait donc
        // une session pourtant valide, empêchant tout drain futur y compris après retour réseau.
        let remote: { contacts: Contact[]; pensees: Pensee[] } | null = null;
        if (isSupabaseConfigured) {
          try {
            const session = await ensureAnonSession();
            if (session) {
              setUserId(session.userId);
              userIdRef.current = session.userId;
              try {
                remote = await loadRemoteData(session.userId, session.isNewAccount);
              } catch (e) {
                console.warn('[Pensif] données distantes indisponibles au démarrage — cache local utilisé', e);
              }
            }
          } catch (e) {
            console.warn('[Pensif] session Supabase indisponible au démarrage — cache local utilisé', e);
          }
        }

        const resolved = resolveBootData({ cachedContacts, cachedPensees, outbox: loadedOutbox, remote });
        setContacts(resolved.contacts);
        setPensees(resolved.pensees);

        // Boot avec une session obtenue (en ligne, ou hors ligne via une session déjà persistée) :
        // drain immédiat — reprend toute mutation restée en attente d'un précédent lancement.
        if (userIdRef.current) void drainNow();
      } catch {
        // stockage totalement indisponible (AsyncStorage lui-même en échec) — on reste sur l'état
        // initial vide, jamais sur des seeds (voir CHANTIER PRÉ-BÊTA 1 §2).
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Persistance locale — utile en secours même quand Supabase est configuré (lecture hors-ligne).
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.contacts, JSON.stringify(contacts)).catch(() => {});
  }, [contacts, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.pensees, JSON.stringify(pensees)).catch(() => {});
  }, [pensees, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.outbox, JSON.stringify(outbox)).catch(() => {});
  }, [outbox, ready]);

  useEffect(() => {
    if (!ready) return;
    if (!notificationsEnabled) {
      cancelAllReminders().catch(() => {});
      return;
    }
    rescheduleAllReminders(contacts, pensees, new Date(), userName).catch(() => {
      // permission refusée ou plateforme non supportée (web) — l'app reste utilisable sans rappels
    });
  }, [ready, contacts, pensees, userName, notificationsEnabled]);

  // Résynchronisation au retour au premier plan : la permission système a pu être changée depuis
  // les réglages du téléphone pendant que l'app était en arrière-plan (l'app elle-même n'a alors
  // reçu aucun changement de state) — sans ça, un planning devenu obsolète (permission retirée)
  // restait silencieusement en place, ou une permission redonnée ne redéclenchait rien tant
  // qu'aucune donnée ne changeait par ailleurs.
  useEffect(() => {
    if (!ready || !notificationsEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      getNotificationPermissionStatus().then((status) => {
        if (status === 'granted') {
          rescheduleAllReminders(contacts, pensees, new Date(), userName).catch(() => {});
        } else {
          cancelAllReminders().catch(() => {});
        }
      });
    });
    return () => sub.remove();
  }, [ready, contacts, pensees, userName, notificationsEnabled]);

  // CHANTIER SYNC OFFLINE→SUPABASE — deux déclencheurs de drain INDÉPENDANTS de la logique
  // notifications ci-dessus (effet séparé, ne touche à aucune des deux dépendances/logique du
  // dessus) :
  // 1. AppState → active : drain "de sécurité" (couvre le cas où l'app était déjà en arrière-plan
  //    quand le réseau est revenu, sans qu'aucun événement NetInfo n'ait pu être observé pendant
  //    qu'elle n'était pas au premier plan sur certains appareils).
  // 2. Retour réseau détecté par NetInfo, piloté par événements (jamais de polling) : couvre
  //    spécifiquement le cas demandé — l'app déjà ouverte, au premier plan, hors ligne, et
  //    l'utilisateur réactive Internet SANS jamais mettre l'app en arrière-plan (AppState ne
  //    changerait alors jamais).
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void restoreSessionThenDrain();
    });
    const unsubscribeNetInfo = subscribeToConnectivityRestored(() => void restoreSessionThenDrain());
    return () => {
      sub.remove();
      unsubscribeNetInfo();
    };
  }, [ready]);

  const value = useMemo<Store>(
    () => {
      const today = new Date();
      return {
      ready,
      today,
      contacts,
      pensees,
      userName,
      // "Envoyé" veut dire : prévu pour l'occurrence d'anniversaire EN COURS, pas pour une
      // occurrence passée — sinon la case restait cochée indéfiniment d'une année sur l'autre
      // (voir occurrenceYear dans calendar.ts).
      giftSentIds: contacts.filter((c) => c.giftPreparedYear === occurrenceYear(c.date, today)).map((c) => c.id),
      namePromptOpen,
      openNamePrompt: () => setNamePromptOpen(true),
      setUserName: (name: string) => {
        setUserNameState(name);
        setNamePromptOpen(false);
        AsyncStorage.setItem(KEYS.userName, name).catch(() => {});
      },
      // CHANTIER SYNC OFFLINE→SUPABASE : les 6 mutations suivent toutes le même principe —
      // 1. état local optimiste (inchangé, comme avant) ; 2. enqueue/coalesce dans l'outbox AVANT
      // de considérer la mutation durable ; 3. tentative de drain immédiate (best-effort, jamais
      // bloquant). Plus aucun appel `insert/update/delete*Remote` direct ici — tout passe par
      // `executeOutboxOp`, seul point qui parle à Supabase pour ces 6 mutations.
      upsertContact: (contact: Contact) => {
        const isNew = !contacts.some((c) => c.id === contact.id);
        setContacts((prev) => (isNew ? [...prev, contact] : prev.map((c) => (c.id === contact.id ? contact : c))));
        enqueueAndDrain((prev) => enqueueUpsertContact(prev, contact, isNew, generateId(), new Date().toISOString()));
      },
      deleteContact: (contactId: string) => {
        // Optimiste ici aussi, et on détache les pensées qui pointaient vers ce contact
        // plutôt que de les supprimer — la base fait pareil (contact_id passe à null).
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
        setPensees((prev) => prev.map((p) => (p.contactId === contactId ? { ...p, contactId: null } : p)));
        enqueueAndDrain((prev) => enqueueDeleteContact(prev, contactId, generateId(), new Date().toISOString()));
        // CHANTIER RÉPONSES INTELLIGENTES (2026-09-16) — effet purement LOCAL (AsyncStorage, hors
        // outbox/sync) : nettoie les brouillons de message de ce contact pour ne pas les laisser
        // orphelins. Ne modifie ni la sémantique de suppression ci-dessus, ni l'outbox.
        void clearMessageDraftsForContact(contactId);
      },
      addPensee: (pensee: Omit<Pensee, 'id'>) => {
        const withId: Pensee = { ...pensee, id: generateId() };
        setPensees((prev) => [...prev, withId]);
        enqueueAndDrain((prev) => enqueueUpsertPensee(prev, withId, true, generateId(), new Date().toISOString()));
      },
      // Modification d'une pensée existante (texte/proche lié/rappel — voir PenseeDetailScreen,
      // CHANTIER PENSÉES V2). Optimiste comme upsertContact ; passe par `setPensees`, ce qui
      // redéclenche l'effet de reprogrammation ci-dessous — l'ancienne notification est donc
      // toujours annulée (cancelAllScheduledNotificationsAsync) avant qu'une nouvelle ne soit
      // programmée à partir du rappel à jour, jamais les deux en même temps.
      updatePensee: (pensee: Pensee) => {
        setPensees((prev) => prev.map((p) => (p.id === pensee.id ? pensee : p)));
        // `isNewIfFirstTime: false` — si cette pensée a en réalité une création encore en attente
        // dans l'outbox (jamais confirmée), enqueueUpsertPensee préserve `isNew: true` tout seul.
        enqueueAndDrain((prev) => enqueueUpsertPensee(prev, pensee, false, generateId(), new Date().toISOString()));
      },
      deletePensee: (penseeId: string) => {
        // Capturé AVANT le filtrage — nécessaire pour retrouver le contact concerné par un éventuel
        // brouillon `event` (voir plus bas), la pensée n'existera plus dans `pensees` juste après.
        const deletedPensee = pensees.find((p) => p.id === penseeId);
        setPensees((prev) => prev.filter((p) => p.id !== penseeId));
        enqueueAndDrain((prev) => enqueueDeletePensee(prev, penseeId, generateId(), new Date().toISOString()));
        // Effet purement LOCAL (comme deleteContact ci-dessus) — si cette pensée servait d'ancre à un
        // message "event", son brouillon devient orphelin, jamais plus atteignable par l'UI.
        if (deletedPensee?.contactId) void clearMessageDraftForEvent(deletedPensee.contactId, penseeId);
      },
      toggleGiftSent: (contactId: string) => {
        const contact = contacts.find((c) => c.id === contactId);
        if (!contact) return;
        const year = occurrenceYear(contact.date, today);
        const nextYear = contact.giftPreparedYear === year ? null : year;
        const updated: Contact = { ...contact, giftPreparedYear: nextYear };
        setContacts((prev) => prev.map((c) => (c.id === contactId ? updated : c)));
        // Réutilise le même chemin qu'un upsertContact classique (updateContactRemote écrit déjà
        // toutes les colonnes du contact, pas seulement `gift_sent` — voir supabaseRepo.ts) : ce
        // bouton avait exactement le même bug (aucun retry en cas d'échec réseau) avant l'outbox.
        enqueueAndDrain((prev) => enqueueUpsertContact(prev, updated, false, generateId(), new Date().toISOString()));
      },
      themePref,
      setThemePref: (pref: ThemePref) => {
        setThemePrefState(pref);
        AsyncStorage.setItem(KEYS.themePref, pref).catch(() => {});
      },
      notificationsEnabled,
      setNotificationsEnabled: (enabled: boolean) => {
        setNotificationsEnabledState(enabled);
        AsyncStorage.setItem(KEYS.notificationsEnabled, enabled ? '1' : '0').catch(() => {});
      },
      resetLocalDemoData: () => {
        setContacts(seedContacts);
        setPensees(seedPensees);
      },
      };
    },
    [ready, contacts, pensees, userName, userId, namePromptOpen, themePref, notificationsEnabled],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}
