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
import { TUTORIAL_SEEN_KEY } from './tutorial';
import { rescheduleAllReminders, cancelAllReminders, clearAppBadge, getNotificationPermissionStatus } from '../lib/notifications';
import { isSupabaseConfigured } from '../lib/supabase';
import { subscribeToConnectivityRestored } from '../lib/netInfo';
import { clearAllLocalDrafts, clearMessageDraftForEvent, clearMessageDraftsForContact } from './messageDraftStorage';
import {
  deleteContactRemote,
  deletePenseeRemote,
  insertContactRemote,
  insertPenseeRemote,
  loadRemoteData,
  updateContactRemote,
  updatePenseeRemote,
} from '../lib/supabaseRepo';
import { ExistingSession, devSignOutForReinstallSimulation, getExistingSession, startAnonymousSession } from '../lib/authRepo';

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
  // CHANTIER "Data Safety P0-1" (2026-09-20) — propriétaire du cache account-scoped (contacts/
  // pensees/outbox), voir `initializeForSession`. Absent = migration (installation antérieure à ce
  // chantier) OU jamais aucune session — jamais interprété comme "aucun propriétaire" au sens d'un
  // effacement, voir la logique dédiée.
  cacheOwnerUserId: 'pensif.cacheOwnerUserId',
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
  // CHANTIER "Data Safety P0-1" (2026-09-20) — 'choice' = aucune session du tout, l'auth gate doit
  // être affiché (voir AuthGateScreen.tsx/App.tsx) ; 'none' = rien à afficher (session déjà connue,
  // OU Supabase non configuré/mode 100% local, qui n'a aucune notion de session).
  authGate: 'none' | 'choice';
  /** Reflète `session.user.is_anonymous` de la session ACTIVE — `false` en mode local (pas de
   *  session Supabase du tout). Pilote l'affichage de "SÉCURISER MES DONNÉES" (SettingsScreen). */
  isAnonymous: boolean;
  /** Choix "Continuer" de l'auth gate — crée un compte anonyme EXPLICITEMENT (jamais en fallback
   *  silencieux) puis boote normalement. Relance l'exception si `startAnonymousSession` échoue —
   *  l'appelant (AuthGateScreen) affiche l'erreur, l'auth gate reste affiché, rien n'est perdu. */
  chooseAnonymous: () => Promise<void>;
  /** Choix "J'ai déjà un compte" de l'auth gate, une fois `verifyExistingAccountOtp` réussi
   *  (authRepo.ts, appelé directement par l'écran) — boote via le MÊME chemin que tout le reste
   *  (`initializeForSession`), jamais une seconde implémentation du boot. */
  completeAuthWithSession: (session: ExistingSession) => Promise<void>;
  /** Appelée par SettingsScreen APRÈS que `verifyAccountSecurityOtp` a réussi ET que l'appelant a
   *  lui-même vérifié `user.id avant === user.id après` (jamais vérifié ici — voir consigne
   *  explicite "traiter comme erreur critique" côté appelant si ça diffère). Aucun reload/purge : le
   *  `user.id` reste identique par construction sur ce chemin, seul `isAnonymous` change. */
  markAccountSecured: () => void;
  /**
   * OUTIL DEV UNIQUEMENT (CHANTIER "Data Safety P0-1 — test récupération sans réinstallation",
   * 2026-09-20) — simule la perte complète session/cache local d'un appareil (équivalent d'une
   * réinstallation), SANS désinstaller Expo Go : déconnecte la session Supabase, purge le cache
   * account-scoped (contacts/pensées/outbox/cacheOwnerUserId + brouillons locaux), préserve les
   * préférences device-scoped (themePref/notificationsEnabled/userName), puis réaffiche l'auth gate.
   * Ne fait RIEN si `!__DEV__` — jamais disponible en build production (voir aussi le garde-fou
   * identique côté `devSignOutForReinstallSimulation`, authRepo.ts, et le rendu conditionnel du
   * bouton dans SettingsScreen, `{__DEV__ && ...}`).
   */
  devSimulateReinstall: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  // CHANTIER "Horloge UI fraîche" (2026-09-23) — `today` était auparavant recréé à l'intérieur du
  // `useMemo<Store>` ci-dessous (`new Date()` à chaque recalcul de ce memo), donc figé tant qu'aucune
  // dépendance MÉTIER (contacts/pensees/session/...) ne changeait — une occurrence de rappel pouvait
  // sonner et passer sans que Home/Pensées ne changent jamais de bucket. `today` est désormais un
  // state React explicite, rafraîchi par 2 mécanismes SEULS (voir plus bas) : retour AppState→active,
  // et un ticker centralisé aligné sur la frontière de minute — AUCUNE logique de récurrence/bucket
  // touchée ici (reminderRecurrence.ts/calendar.ts/homeAttention.ts/penseesView.ts inchangés).
  const [today, setToday] = useState<Date>(() => new Date());
  // Badge binaire (2026-09-24) — cold start : un lancement peut démarrer directement en 'active' (aucun
  // changement AppState observé), donc le badge est aussi remis à 0 UNE fois au montage du Store.
  useEffect(() => {
    void clearAppBadge();
  }, []);
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
  // CHANTIER "Data Safety P0-1" (2026-09-20) — 'none' tant qu'on ne SAIT PAS encore qu'aucune session
  // n'existe (évite un flash de l'auth gate pendant la lecture AsyncStorage) ; passe à 'choice'
  // UNIQUEMENT si `getExistingSession()` résout `null` au boot (jamais avant, jamais par un effet
  // réactif qui pourrait se déclencher en arrière-plan).
  const [authGate, setAuthGate] = useState<'none' | 'choice'>('none');
  const [isAnonymousState, setIsAnonymousState] = useState(false);
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
          await deleteContactRemote(op.entityId, userIdRef.current);
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
          await updateContactRemote(op.payload, userIdRef.current);
        }
      } else {
        if (op.action === 'delete') {
          await deletePenseeRemote(op.entityId, userIdRef.current);
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
   * CHANTIER "Data Safety P0-1" (2026-09-20) — chemin de boot UNIQUE, partagé par les 3 points
   * d'entrée possibles (session déjà connue au boot, "Continuer" → compte anonyme neuf,
   * "J'ai déjà un compte" → compte permanent retrouvé) : jamais deux implémentations différentes du
   * boot (consigne explicite §4).
   *
   * Ownership du cache (§5) — AVANT tout drain :
   * - `cacheOwnerUserId` absent (migration d'une installation antérieure à ce chantier, OU tout
   *   premier lancement avec un cache déjà vide) → le cache existant (s'il y en a un) est attribué à
   *   CETTE session sans rien effacer, `cacheOwnerUserId` est simplement écrit.
   * - `cacheOwnerUserId` présent et IDENTIQUE à `session.userId` → cache chargé normalement.
   * - `cacheOwnerUserId` présent et DIFFÉRENT → le cache appartient à un AUTRE compte (ancienne
   *   session temporaire, voir le risque explicite de la consigne) : contacts/pensées/outbox sont
   *   PURGÉS (état + AsyncStorage) AVANT toute lecture/tout drain — aucune ancienne opération outbox
   *   n'est jamais exécutée sous le nouveau `user_id`. Les brouillons locaux (message/quiz) sont
   *   purgés avec (§6, peuvent révéler le contenu de l'ancien compte).
   */
  async function initializeForSession(session: ExistingSession) {
    userIdRef.current = session.userId;
    setUserId(session.userId);
    setIsAnonymousState(session.isAnonymous);

    const storedOwner = await AsyncStorage.getItem(KEYS.cacheOwnerUserId).catch(() => null);

    let cachedContacts: Contact[] = [];
    let cachedPensees: Pensee[] = [];
    let loadedOutbox: Outbox = [];

    if (storedOwner && storedOwner !== session.userId) {
      await Promise.all([
        AsyncStorage.removeItem(KEYS.contacts),
        AsyncStorage.removeItem(KEYS.pensees),
        AsyncStorage.removeItem(KEYS.outbox),
      ]).catch(() => {});
      await clearAllLocalDrafts();
      await AsyncStorage.setItem(KEYS.cacheOwnerUserId, session.userId).catch(() => {});
      // cachedContacts/cachedPensees/loadedOutbox restent volontairement vides (fraîchement purgés).
    } else {
      const [cachedContactsRaw, cachedPenseesRaw, outboxRaw, legacyPendingDelContactsRaw, legacyPendingDelPenseesRaw] = await Promise.all([
        AsyncStorage.getItem(KEYS.contacts),
        AsyncStorage.getItem(KEYS.pensees),
        AsyncStorage.getItem(KEYS.outbox),
        AsyncStorage.getItem(KEYS.pendingDeleteContacts),
        AsyncStorage.getItem(KEYS.pendingDeletePensees),
      ]);
      cachedContacts = cachedContactsRaw ? JSON.parse(cachedContactsRaw) : [];
      cachedPensees = cachedPenseesRaw ? JSON.parse(cachedPenseesRaw).map(normalizePensee) : [];
      loadedOutbox = outboxRaw ? JSON.parse(outboxRaw) : [];
      const legacyPendingDelContacts: string[] = legacyPendingDelContactsRaw ? JSON.parse(legacyPendingDelContactsRaw) : [];
      const legacyPendingDelPensees: string[] = legacyPendingDelPenseesRaw ? JSON.parse(legacyPendingDelPenseesRaw) : [];
      if (legacyPendingDelContacts.length || legacyPendingDelPensees.length) {
        loadedOutbox = migrateLegacyPendingDeletes(loadedOutbox, legacyPendingDelContacts, legacyPendingDelPensees, generateId, new Date().toISOString());
      }
      if (!storedOwner) {
        // Migration (§5, "installations actuelles") — jamais d'effacement, seulement l'attribution.
        await AsyncStorage.setItem(KEYS.cacheOwnerUserId, session.userId).catch(() => {});
      }
    }

    outboxRef.current = loadedOutbox;
    setOutbox(loadedOutbox);

    let remote: { contacts: Contact[]; pensees: Pensee[] } | null = null;
    try {
      remote = await loadRemoteData(session.userId, false);
    } catch (e) {
      console.warn('[Pensif] données distantes indisponibles — cache local utilisé', e);
    }

    const resolved = resolveBootData({ cachedContacts, cachedPensees, outbox: loadedOutbox, remote });
    setContacts(resolved.contacts);
    setPensees(resolved.pensees);

    if (userIdRef.current) void drainNow();
  }

  /**
   * OUTIL DEV UNIQUEMENT (CHANTIER "Data Safety P0-1 — test récupération sans réinstallation",
   * 2026-09-20) — voir le type `devSimulateReinstall` sur `Store` plus haut pour le contexte complet.
   * Ordre STRICT et volontaire :
   *   1. signOut Supabase (avant toute purge — une fois déconnecté, plus aucune écriture distante
   *      ne peut partir avec l'ancien user.id).
   *   2. Purge AsyncStorage du cache account-scoped UNIQUEMENT (contacts/pensées/outbox/
   *      cacheOwnerUserId) + brouillons locaux (clearAllLocalDrafts — peuvent révéler le contenu de
   *      l'ancien compte, même règle que le changement de propriétaire de cache, §5/§6).
   *   3. SEULEMENT ENSUITE, état en mémoire réinitialisé (outboxRef AVANT tout, comme partout
   *      ailleurs dans ce fichier — voir le commentaire sur `outboxRef` en haut du fichier) :
   *      `userIdRef.current`/`setUserId(null)` marquent explicitement "aucun compte", donc
   *      `enqueueAndDrain`/`drainNow` (gardés par `if (!userIdRef.current) return`) ne peuvent plus
   *      rien exécuter, même si un appel traîne encore en attente. AUCUN `drainNow()` n'est appelé
   *      ici, à aucun moment.
   *   4. `authGate = 'choice'` — ré-affiche l'écran de choix, exactement comme un premier lancement
   *      sans session.
   * MISE À JOUR 2026-09-24 : les préférences device-scoped (userName/themePref/notificationsEnabled) ET le
   * flag tutoriel sont désormais REMIS À NEUF (voir plus bas) pour reproduire une vraie 1re installation.
   */
  async function devSimulateReinstall() {
    if (!__DEV__) return;

    await devSignOutForReinstallSimulation();

    await Promise.all([
      AsyncStorage.removeItem(KEYS.contacts),
      AsyncStorage.removeItem(KEYS.pensees),
      AsyncStorage.removeItem(KEYS.outbox),
      AsyncStorage.removeItem(KEYS.cacheOwnerUserId),
      // CHANTIER "DEV — Simuler une vraie première installation" (2026-09-24) : le reset reproduit désormais
      // TOUT l'état local d'un nouvel utilisateur — prénom, préférences internes (thème, rappels) et flag
      // tutoriel (sinon : plus de saisie de prénom ni de tutoriel après "Commencer"). Les permissions
      // SYSTÈME iOS (micro/notifications) ne sont pas réinitialisables par l'app. AUCUNE donnée serveur n'est
      // touchée (signOut local uniquement, voir devSignOutForReinstallSimulation).
      AsyncStorage.removeItem(KEYS.userName),
      AsyncStorage.removeItem(KEYS.themePref),
      AsyncStorage.removeItem(KEYS.notificationsEnabled),
      AsyncStorage.removeItem(TUTORIAL_SEEN_KEY),
    ]).catch(() => {});
    await clearAllLocalDrafts();

    outboxRef.current = [];
    setOutbox([]);
    setContacts([]);
    setPensees([]);
    setUserNameState(null);
    setNamePromptOpen(false);
    setThemePrefState('system');
    setNotificationsEnabledState(true);
    userIdRef.current = null;
    setUserId(null);
    setIsAnonymousState(false);
    setAuthGate('choice');
  }

  /**
   * BUG SYNC OFFLINE — COLD START : un cold start hors ligne peut échouer à charger `loadRemoteData`
   * (réseau requis) alors qu'une session PERSISTÉE LOCALEMENT existe déjà (voir supabase.ts
   * `persistSession: true`). CHANTIER "Data Safety P0-1" (2026-09-20) — CORRECTIF : cette fonction ne
   * fait plus que RESTAURER une session déjà connue (`getExistingSession()`, lecture locale pure) —
   * elle ne crée PLUS JAMAIS de compte anonyme en fallback silencieux (l'ancien `ensureAnonSession()`
   * le faisait, en violation directe de l'architecture retenue : "aucun anonyme temporaire créé
   * automatiquement"). Si aucune session n'existe (utilisateur encore à l'auth gate, ou jamais
   * connecté), cette fonction ne fait STRICTEMENT rien — jamais d'anonymat créé en arrière-plan
   * pendant que l'utilisateur regarde l'écran de choix.
   */
  async function restoreSessionThenDrain() {
    if (!isSupabaseConfigured) return;
    if (!userIdRef.current) {
      if (sessionRestoringRef.current) return;
      sessionRestoringRef.current = true;
      try {
        const session = await getExistingSession();
        if (session) {
          userIdRef.current = session.userId;
          setUserId(session.userId);
          setIsAnonymousState(session.isAnonymous);
        }
      } catch (e) {
        console.warn('[Pensif] session Supabase toujours indisponible — nouvel essai au prochain retour réseau', e);
        return;
      } finally {
        sessionRestoringRef.current = false;
      }
      if (!userIdRef.current) return; // toujours aucune session — rien à drainer, jamais d'anonyme créé ici
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
        // CHANTIER "Post-TestFlight Phase 6 — Notifications permission sync" (2026-09-23) — CORRECTIF
        // BUG confirmé en conditions réelles : `notificationsEnabled` démarrait à `true` (voir sa
        // déclaration) et cette clé absente sur une installation fraîche (`n === null`) ne changeait
        // jamais rien — le toggle restait "ON" sans que la permission iOS n'ait jamais été demandée
        // (undetermined), donc sans qu'aucun rappel ne puisse réellement être programmé. Uniquement
        // quand AUCUNE préférence n'a encore été explicitement choisie (`n === null` — un flip manuel
        // du toggle écrit TOUJOURS '0'/'1', voir setNotificationsEnabled plus bas, donc ce cas ne
        // concerne que le tout premier lancement) : dériver l'état initial de la permission SYSTÈME
        // réelle plutôt que d'un booléen arbitraire — `granted` → true, `denied`/`undetermined` →
        // false (jamais représenté comme actif tant que rien n'est confirmé, voir consigne). Ne
        // redemande JAMAIS la permission ici (lecture seule, `getNotificationPermissionStatus` ne
        // fait qu'interroger l'OS) — seule une action utilisateur explicite (toggle, ou premier
        // rappel créé, voir store.tsx `setReminderPreferenceFromFirstUse`) peut déclencher un prompt.
        // Si `n` est déjà '0'/'1' (préférence déjà choisie explicitement par le passé), comportement
        // STRICTEMENT inchangé : cette branche n'est jamais atteinte.
        if (n === null) {
          const status = await getNotificationPermissionStatus();
          if (status === 'granted') setNotificationsEnabledState(true);
          else setNotificationsEnabledState(false);
        } else if (n === '0') {
          setNotificationsEnabledState(false);
        }

        if (!isSupabaseConfigured) {
          // Mode 100% local — AUCUNE notion de session/auth gate n'existe dans ce mode (comportement
          // strictement identique à avant ce chantier). Lu AVANT toute décision : sert de secours
          // hors-ligne, mais surtout de filet de sécurité — si un ajout précédent n'a jamais fini par
          // atteindre le serveur, il ne doit pas disparaître silencieusement au prochain lancement.
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
          let loadedOutbox: Outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
          const legacyPendingDelContacts: string[] = legacyPendingDelContactsRaw ? JSON.parse(legacyPendingDelContactsRaw) : [];
          const legacyPendingDelPensees: string[] = legacyPendingDelPenseesRaw ? JSON.parse(legacyPendingDelPenseesRaw) : [];
          if (legacyPendingDelContacts.length || legacyPendingDelPensees.length) {
            loadedOutbox = migrateLegacyPendingDeletes(loadedOutbox, legacyPendingDelContacts, legacyPendingDelPensees, generateId, new Date().toISOString());
          }
          outboxRef.current = loadedOutbox;
          setOutbox(loadedOutbox);
          const resolved = resolveBootData({ cachedContacts, cachedPensees, outbox: loadedOutbox, remote: null });
          setContacts(resolved.contacts);
          setPensees(resolved.pensees);
          setAuthGate('none');
        } else {
          // CHANTIER "Data Safety P0-1" (2026-09-20) — JAMAIS de création de session automatique ici
          // (voir architecture retenue). `getExistingSession()` est une lecture locale pure (aucun
          // appel réseau, fonctionne hors ligne grâce à `persistSession:true`, supabase.ts) : si elle
          // résout `null`, c'est qu'AUCUNE session n'existe sur cet appareil — l'auth gate doit être
          // affiché, jamais un compte anonyme créé à sa place.
          try {
            const session = await getExistingSession();
            if (session) {
              await initializeForSession(session);
              setAuthGate('none');
            } else {
              setAuthGate('choice');
            }
          } catch (e) {
            console.warn('[Pensif] lecture de session indisponible au démarrage — auth gate affiché', e);
            setAuthGate('choice');
          }
        }
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
      if (state === 'active') {
        // CHANTIER "Horloge UI fraîche" (2026-09-23) — même listener que le drain outbox ci-dessous
        // (consigne explicite : ne pas créer un 2e listener AppState) : `today` doit être à jour
        // IMMÉDIATEMENT au retour au premier plan, avant même que restoreSessionThenDrain() ne
        // termine (celui-ci reste réseau/best-effort, jamais un prérequis à l'affichage temporel).
        setToday(new Date());
        // Badge binaire (2026-09-24) : dès que l'utilisateur revient dans Pensif, plus aucun rappel "non consulté".
        void clearAppBadge();
        void restoreSessionThenDrain();
      }
    });
    const unsubscribeNetInfo = subscribeToConnectivityRestored(() => void restoreSessionThenDrain());
    return () => {
      sub.remove();
      unsubscribeNetInfo();
    };
  }, [ready]);

  // CHANTIER "Horloge UI fraîche" (2026-09-23) — ticker CENTRAL unique (jamais un timer par écran,
  // voir consigne §3/§4 : Home/Pensées consomment déjà la même source `today` via useStore(), aucun
  // useFocusEffect ajouté). Les rappels Pensif étant à la minute (HH:mm, voir reminderAt), se réveiller
  // à CHAQUE frontière de minute suffit — jamais un polling à la seconde. `setTimeout` aligné sur la
  // prochaine frontière (+ petite marge, voir ci-dessous) plutôt qu'un `setInterval` démarré à un
  // instant arbitraire, qui dériverait au fil des réveils (setInterval n'est pas garanti précis à la
  // milliseconde en JS/RN). Actif UNIQUEMENT quand l'app est au premier plan — arrêté en
  // background/inactive (aucun réveil timer inutile hors foreground), redémarre au retour actif via
  // le même effet (dépendance `ready` + état AppState interne), et nettoyé au unmount.
  useEffect(() => {
    if (!ready) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let appActive = AppState.currentState === 'active';

    function clearTick() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function scheduleNextMinuteTick() {
      clearTick();
      if (!appActive) return;
      const now = new Date();
      // +50ms de marge après la frontière de minute — évite de se réveiller une milliseconde AVANT
      // 18:00:00.000 à cause de l'imprécision de setTimeout, ce qui redonnerait l'ancienne minute.
      const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
      timeoutId = setTimeout(() => {
        setToday(new Date());
        scheduleNextMinuteTick();
      }, msUntilNextMinute);
    }

    scheduleNextMinuteTick();

    const sub = AppState.addEventListener('change', (state) => {
      const nowActive = state === 'active';
      if (nowActive === appActive) return;
      appActive = nowActive;
      if (appActive) {
        setToday(new Date());
        scheduleNextMinuteTick();
      } else {
        clearTick();
      }
    });

    return () => {
      clearTick();
      sub.remove();
    };
  }, [ready]);

  const value = useMemo<Store>(
    () => {
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
      authGate,
      isAnonymous: isAnonymousState,
      // "Continuer" — crée EXPLICITEMENT un compte anonyme (jamais en fallback silencieux ailleurs)
      // puis boote via le MÊME chemin que tout le reste (initializeForSession, consigne §4). Relance
      // toute erreur (réseau/serveur) — l'auth gate (AuthGateScreen) reste affiché, rien n'est perdu,
      // un nouvel essai reste possible (consigne §7 : "un abandon du flow ne doit jamais bloquer le
      // boot normal futur").
      chooseAnonymous: async () => {
        const session = await startAnonymousSession();
        if (!session) return;
        await initializeForSession(session);
        setAuthGate('none');
      },
      // "J'ai déjà un compte" — appelée par AuthGateScreen APRÈS que verifyExistingAccountOtp
      // (authRepo.ts) a déjà réussi : ne fait ICI que le boot, jamais l'appel réseau OTP lui-même
      // (reste dans l'écran, comme le reste de l'app — CaptureScreen/PenseeDetailScreen appellent
      // directement leurs libs dédiées). Même chemin `initializeForSession` que "Continuer".
      completeAuthWithSession: async (session: ExistingSession) => {
        await initializeForSession(session);
        setAuthGate('none');
      },
      // Sécurisation du compte courant (anonyme → permanent, SettingsScreen) — AUCUN reload/purge ici
      // : le `user.id` reste identique par construction sur ce chemin (consigne §2), seul l'état
      // local `isAnonymous` change. La vérification "user.id avant === user.id après" reste de la
      // responsabilité de l'appelant (SettingsScreen), jamais silencieusement supposée ici.
      markAccountSecured: () => {
        setIsAnonymousState(false);
      },
      devSimulateReinstall,
      };
    },
    [ready, today, contacts, pensees, userName, userId, namePromptOpen, themePref, notificationsEnabled, authGate, isAnonymousState],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}
