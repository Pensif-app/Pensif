import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Contact, Pensee } from './types';
import { seedContacts, seedPensees } from './seed';
import { occurrenceYear } from './calendar';
import { generateId } from '../lib/id';
import { rescheduleAllReminders, cancelAllReminders, getNotificationPermissionStatus } from '../lib/notifications';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  deleteContactRemote,
  deletePenseeRemote,
  ensureAnonSession,
  insertContactRemote,
  insertPenseeRemote,
  loadRemoteData,
  setGiftSentRemote,
  updateContactRemote,
} from '../lib/supabaseRepo';

const KEYS = {
  contacts: 'pensif.contacts',
  pensees: 'pensif.pensees',
  userName: 'pensif.userName',
  themePref: 'pensif.themePref',
  notificationsEnabled: 'pensif.notificationsEnabled',
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
  const [contacts, setContacts] = useState<Contact[]>(seedContacts);
  const [pensees, setPensees] = useState<Pensee[]>(seedPensees);
  const [userName, setUserNameState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [themePref, setThemePrefState] = useState<ThemePref>('system');
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  // Suppressions dont la confirmation serveur n'est pas encore arrivée — sans ça, un delete distant
  // qui échoue silencieusement (réseau coupé pile à ce moment, etc.) faisait réapparaître le
  // contact/la pensée "supprimé·e" au lancement suivant, puisque loadRemoteData() fait alors
  // autorité et le retrouve toujours en base. Persisté pour survivre à un redémarrage.
  const [pendingDeleteContactIds, setPendingDeleteContactIds] = useState<string[]>([]);
  const [pendingDeletePenseeIds, setPendingDeletePenseeIds] = useState<string[]>([]);

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
        const [cachedContactsRaw, cachedPenseesRaw, pendingDelContactsRaw, pendingDelPenseesRaw] = await Promise.all([
          AsyncStorage.getItem(KEYS.contacts),
          AsyncStorage.getItem(KEYS.pensees),
          AsyncStorage.getItem(KEYS.pendingDeleteContacts),
          AsyncStorage.getItem(KEYS.pendingDeletePensees),
        ]);
        const cachedContacts: Contact[] = cachedContactsRaw ? JSON.parse(cachedContactsRaw) : [];
        const cachedPensees: Pensee[] = cachedPenseesRaw ? JSON.parse(cachedPenseesRaw) : [];
        const pendingDelContacts: string[] = pendingDelContactsRaw ? JSON.parse(pendingDelContactsRaw) : [];
        const pendingDelPensees: string[] = pendingDelPenseesRaw ? JSON.parse(pendingDelPenseesRaw) : [];
        if (pendingDelContacts.length) setPendingDeleteContactIds(pendingDelContacts);
        if (pendingDelPensees.length) setPendingDeletePenseeIds(pendingDelPensees);

        if (isSupabaseConfigured) {
          const session = await ensureAnonSession();
          if (session) {
            const { userId: uid, isNewAccount } = session;
            setUserId(uid);
            const remote = await loadRemoteData(uid, isNewAccount);

            // Écarte tout ce qui a été supprimé localement mais dont le delete serveur n'a jamais
            // été confirmé — sinon ça revient d'entre les morts à chaque lancement tant que la
            // suppression distante n'a pas fini par réussir (voir deleteContact/deletePensee).
            const pendingDelContactSet = new Set(pendingDelContacts);
            const pendingDelPenseeSet = new Set(pendingDelPensees);
            const remoteContacts = remote.contacts.filter((c) => !pendingDelContactSet.has(c.id));
            const remotePensees = remote.pensees.filter((p) => !pendingDelPenseeSet.has(p.id));

            const remoteContactIds = new Set(remoteContacts.map((c) => c.id));
            const pendingContacts = cachedContacts.filter((c) => !remoteContactIds.has(c.id) && !pendingDelContactSet.has(c.id));
            const remotePenseeIds = new Set(remotePensees.map((p) => p.id));
            const pendingPensees = cachedPensees.filter((p) => !remotePenseeIds.has(p.id) && !pendingDelPenseeSet.has(p.id));

            setContacts([...remoteContacts, ...pendingContacts]);
            setPensees([...remotePensees, ...pendingPensees]);

            // Retente l'envoi de ce qui n'était jamais arrivé côté serveur, plutôt que de laisser
            // l'échec silencieux d'origine se reproduire indéfiniment.
            pendingContacts.forEach((c) => {
              const { initials, color, ...rest } = c;
              insertContactRemote(uid, rest).catch((e) => console.warn('[Pensif] nouvelle tentative de synchro du contact échouée', e));
            });
            pendingPensees.forEach((p) => {
              insertPenseeRemote(uid, p).catch((e) => console.warn('[Pensif] nouvelle tentative de synchro de la pensée échouée', e));
            });
            // Retente les suppressions restées en attente.
            pendingDelContacts.forEach((id) => {
              deleteContactRemote(id)
                .then(() => setPendingDeleteContactIds((prev) => prev.filter((x) => x !== id)))
                .catch((e) => console.warn('[Pensif] nouvelle tentative de suppression du contact échouée', e));
            });
            pendingDelPensees.forEach((id) => {
              deletePenseeRemote(id)
                .then(() => setPendingDeletePenseeIds((prev) => prev.filter((x) => x !== id)))
                .catch((e) => console.warn('[Pensif] nouvelle tentative de suppression de la pensée échouée', e));
            });
            return;
          }
        }

        // Pas de Supabase configuré (ou échec de connexion) : on reste sur le cache local lu plus haut.
        if (cachedContactsRaw) setContacts(cachedContacts);
        if (cachedPenseesRaw) setPensees(cachedPensees);
      } catch {
        // stockage/réseau indisponible — on continue avec les données de démo en mémoire
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
    if (ready) AsyncStorage.setItem(KEYS.pendingDeleteContacts, JSON.stringify(pendingDeleteContactIds)).catch(() => {});
  }, [pendingDeleteContactIds, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEYS.pendingDeletePensees, JSON.stringify(pendingDeletePenseeIds)).catch(() => {});
  }, [pendingDeletePenseeIds, ready]);

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
      upsertContact: (contact: Contact) => {
        const isNew = !contacts.some((c) => c.id === contact.id);
        // Mise à jour optimiste : l'écran reflète le changement immédiatement, qu'on soit en
        // local ou branché sur Supabase — la confirmation réseau vient juste réconcilier ensuite.
        setContacts((prev) => (isNew ? [...prev, contact] : prev.map((c) => (c.id === contact.id ? contact : c))));
        if (isSupabaseConfigured && userId) {
          if (isNew) {
            const { initials, color, ...rest } = contact;
            insertContactRemote(userId, rest)
              .then((created) => setContacts((prev) => prev.map((c) => (c.id === contact.id ? created : c))))
              .catch((e) => {
                // Ne PAS retirer le contact localement : il reste dans `contacts` et dans le cache
                // AsyncStorage (voir l'effet de persistance ci-dessus), et sera retenté au prochain
                // lancement de l'app (voir la logique de fusion dans le useEffect d'init).
                console.warn('[Pensif] échec de synchronisation du contact, retenté au prochain lancement', e);
              });
          } else {
            updateContactRemote(contact).catch(() => {});
          }
        }
      },
      deleteContact: (contactId: string) => {
        // Optimiste ici aussi, et on détache les pensées qui pointaient vers ce contact
        // plutôt que de les supprimer — la base fait pareil (contact_id passe à null).
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
        setPensees((prev) => prev.map((p) => (p.contactId === contactId ? { ...p, contactId: null } : p)));
        if (isSupabaseConfigured && userId) {
          deleteContactRemote(contactId).catch((e) => {
            // Si ce delete n'aboutit jamais côté serveur, le contact reviendrait au prochain
            // lancement (loadRemoteData ferait autorité) — on mémorise donc la suppression en
            // attente pour la filtrer/la retenter au boot (voir le useEffect d'init).
            console.warn('[Pensif] échec de suppression du contact, retentée au prochain lancement', e);
            setPendingDeleteContactIds((prev) => (prev.includes(contactId) ? prev : [...prev, contactId]));
          });
        }
      },
      addPensee: (pensee: Omit<Pensee, 'id'>) => {
        const withId: Pensee = { ...pensee, id: generateId() };
        setPensees((prev) => [...prev, withId]);
        if (isSupabaseConfigured && userId) {
          insertPenseeRemote(userId, withId)
            .then((created) => setPensees((prev) => prev.map((p) => (p.id === withId.id ? created : p))))
            .catch((e) => {
              console.warn('[Pensif] échec de synchronisation de la pensée, retentée au prochain lancement', e);
            });
        }
      },
      deletePensee: (penseeId: string) => {
        setPensees((prev) => prev.filter((p) => p.id !== penseeId));
        if (isSupabaseConfigured && userId) {
          deletePenseeRemote(penseeId).catch((e) => {
            console.warn('[Pensif] échec de suppression de la pensée, retentée au prochain lancement', e);
            setPendingDeletePenseeIds((prev) => (prev.includes(penseeId) ? prev : [...prev, penseeId]));
          });
        }
      },
      toggleGiftSent: (contactId: string) => {
        const contact = contacts.find((c) => c.id === contactId);
        if (!contact) return;
        const year = occurrenceYear(contact.date, today);
        const nextYear = contact.giftPreparedYear === year ? null : year;
        if (isSupabaseConfigured && userId) {
          setGiftSentRemote(contactId, nextYear != null).catch(() => {});
        }
        setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, giftPreparedYear: nextYear } : c)));
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
