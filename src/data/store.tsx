import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Contact, Pensee } from './types';
import { seedContacts, seedPensees } from './seed';
import { rescheduleAllReminders, cancelAllReminders } from '../lib/notifications';
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

        if (isSupabaseConfigured) {
          const uid = await ensureAnonSession();
          if (uid) {
            setUserId(uid);
            const remote = await loadRemoteData(uid);
            setContacts(remote.contacts);
            setPensees(remote.pensees);
            return;
          }
        }

        // Pas de Supabase configuré (ou échec de connexion) : on reste en local.
        const [c, p] = await Promise.all([AsyncStorage.getItem(KEYS.contacts), AsyncStorage.getItem(KEYS.pensees)]);
        if (c) setContacts(JSON.parse(c));
        if (p) setPensees(JSON.parse(p));
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
    if (!ready) return;
    if (!notificationsEnabled) {
      cancelAllReminders().catch(() => {});
      return;
    }
    rescheduleAllReminders(contacts, pensees, new Date(), userName).catch(() => {
      // permission refusée ou plateforme non supportée (web) — l'app reste utilisable sans rappels
    });
  }, [ready, contacts, pensees, userName, notificationsEnabled]);

  const value = useMemo<Store>(
    () => ({
      ready,
      today: new Date(),
      contacts,
      pensees,
      userName,
      giftSentIds: contacts.filter((c) => c.giftSent).map((c) => c.id),
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
            const { id, initials, color, ...rest } = contact;
            insertContactRemote(userId, rest)
              .then((created) => setContacts((prev) => prev.map((c) => (c.id === contact.id ? created : c))))
              .catch(() => {});
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
          deleteContactRemote(contactId).catch(() => {});
        }
      },
      addPensee: (pensee: Omit<Pensee, 'id'>) => {
        const tempId = `p${Date.now()}`;
        setPensees((prev) => [...prev, { ...pensee, id: tempId }]);
        if (isSupabaseConfigured && userId) {
          insertPenseeRemote(userId, pensee)
            .then((created) => setPensees((prev) => prev.map((p) => (p.id === tempId ? created : p))))
            .catch(() => {});
        }
      },
      deletePensee: (penseeId: string) => {
        setPensees((prev) => prev.filter((p) => p.id !== penseeId));
        if (isSupabaseConfigured && userId) {
          deletePenseeRemote(penseeId).catch(() => {});
        }
      },
      toggleGiftSent: (contactId: string) => {
        const contact = contacts.find((c) => c.id === contactId);
        if (!contact) return;
        const nextValue = !contact.giftSent;
        if (isSupabaseConfigured && userId) {
          setGiftSentRemote(contactId, nextValue).catch(() => {});
        }
        setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, giftSent: nextValue } : c)));
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
    }),
    [ready, contacts, pensees, userName, userId, namePromptOpen, themePref, notificationsEnabled],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}
