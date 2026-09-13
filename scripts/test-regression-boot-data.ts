// Tests de non-régression — CHANTIER PRÉ-BÊTA 1 §1/§2/§3 (fallback Supabase au démarrage, plus
// d'injection automatique des seeds, aucune suppression de données existantes) + CHANTIER SYNC
// OFFLINE→SUPABASE (l'outbox doit gagner contre un distant obsolète au boot, scénarios A/B/H de la
// consigne). Teste `resolveBootData` (storeInit.ts), pur, sans dépendance AsyncStorage/Supabase/
// react-native — voir ce fichier. Assertions dures : lève une exception (code de sortie non-nul) si
// une régression est détectée. Lecture seule — aucune donnée n'est modifiée par ce script.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-boot-data.ts

import { Contact, Pensee } from '../src/data/types';
import { resolveBootData } from '../src/data/storeInit';
import { Outbox } from '../src/data/outbox';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme',
    initials: 'T',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    date: '2026-01-01',
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    ...overrides,
  };
}

console.log('\n[1] Installation neuve locale (pas de Supabase) : cache vide → tableaux vides, jamais des seeds');
{
  const result = resolveBootData({ cachedContacts: [], cachedPensees: [], outbox: [], remote: null });
  check('contacts vide', result.contacts.length === 0);
  check('pensees vide', result.pensees.length === 0);
}

console.log('\n[2] Cache existant + Supabase indisponible au chargement → le cache local est conservé tel quel');
{
  const alice = makeContact({ id: 'alice', prenom: 'Alice' });
  const bob = makeContact({ id: 'bob', prenom: 'Bob' });
  const pensee = makePensee({ id: 'pensee-1', texte: 'Anniversaire de Bob' });
  const result = resolveBootData({
    cachedContacts: [alice, bob],
    cachedPensees: [pensee],
    outbox: [],
    remote: null, // Supabase configuré mais l'appel a échoué (réseau, DB down…)
  });
  check('les 2 contacts du cache sont conservés', result.contacts.length === 2 && result.contacts.some((c) => c.id === 'alice') && result.contacts.some((c) => c.id === 'bob'));
  check('la pensée du cache est conservée', result.pensees.length === 1 && result.pensees[0].id === 'pensee-1');
}

console.log('\n[3] Supabase disponible → un contact local pas encore connu du distant est conservé en plus');
{
  const remoteAlice = makeContact({ id: 'alice', prenom: 'Alice (distant)' });
  const localOnlyCharlie = makeContact({ id: 'charlie', prenom: 'Charlie' }); // créé hors-ligne, pas encore sur le serveur
  const result = resolveBootData({
    cachedContacts: [remoteAlice, localOnlyCharlie],
    cachedPensees: [],
    outbox: [],
    remote: { contacts: [remoteAlice], pensees: [] },
  });
  check('le contact distant est présent', result.contacts.some((c) => c.id === 'alice'));
  check('le contact local non-synchronisé est ajouté en plus', result.contacts.some((c) => c.id === 'charlie'));
}

console.log('\n[4] Suppression en attente (outbox) non confirmée → jamais résurrectée, ni depuis le cache ni depuis le distant');
{
  const alice = makeContact({ id: 'alice' });
  const outbox: Outbox = [{ opId: 'op-1', kind: 'contact', entityId: 'alice', action: 'delete', enqueuedAt: '2026-01-01T00:00:00.000Z' }];
  const result = resolveBootData({
    cachedContacts: [alice],
    cachedPensees: [],
    outbox,
    remote: { contacts: [alice], pensees: [] }, // le serveur ne sait pas encore que la suppression a eu lieu
  });
  check('alice absente malgré sa présence en cache ET côté distant', !result.contacts.some((c) => c.id === 'alice'));
}

console.log('\n[5] Cache vide + Supabase indisponible → état vide, jamais de seeds (répétition explicite du cas §2 du chantier)');
{
  const result = resolveBootData({ cachedContacts: [], cachedPensees: [], outbox: [], remote: null });
  check('contacts vide (pas de Papa/Léa/Karim/Odile/Sofia)', result.contacts.length === 0);
  check('pensees vide', result.pensees.length === 0);
}

console.log('\n[6] Aucune suppression automatique de données existantes : un contact nommé "Papa" en cache survit à un échec Supabase');
{
  const papa = makeContact({ id: 'papa', prenom: 'Papa' }); // même id que l'ancien seed — ne doit jamais être traité spécialement
  const result = resolveBootData({ cachedContacts: [papa], cachedPensees: [], outbox: [], remote: null });
  check('"Papa" existant conservé (jamais confondu avec une donnée de démo à purger)', result.contacts.some((c) => c.id === 'papa'));
}

console.log('\n[A] CHANTIER SYNC — update pensée offline → restart offline (Supabase indisponible) → valeur locale conservée');
{
  const localEdit = makePensee({ id: 'p-1', texte: 'Nouvelle valeur locale' });
  const outbox: Outbox = [{ opId: 'op-a', kind: 'pensee', entityId: 'p-1', action: 'upsert', isNew: false, payload: localEdit, enqueuedAt: '2026-01-01T00:00:00.000Z' }];
  const result = resolveBootData({ cachedContacts: [], cachedPensees: [localEdit], outbox, remote: null });
  check('la pensée relue au boot porte bien la valeur locale', result.pensees.find((p) => p.id === 'p-1')?.texte === 'Nouvelle valeur locale');
}

console.log('\n[B] CHANTIER SYNC — update pensée offline → boot avec remote ANCIEN (jamais reçu la modif) → le pending local gagne');
{
  const staleRemote = makePensee({ id: 'p-2', texte: 'Ancienne valeur (distant pas encore à jour)' });
  const localEdit = makePensee({ id: 'p-2', texte: 'Nouvelle valeur (pas encore poussée)' });
  const outbox: Outbox = [{ opId: 'op-b', kind: 'pensee', entityId: 'p-2', action: 'upsert', isNew: false, payload: localEdit, enqueuedAt: '2026-01-01T00:00:00.000Z' }];
  const result = resolveBootData({
    cachedContacts: [],
    cachedPensees: [localEdit],
    outbox,
    remote: { contacts: [], pensees: [staleRemote] }, // le distant répond, mais avec l'ancienne valeur
  });
  const resolved = result.pensees.find((p) => p.id === 'p-2');
  check('le texte affiché est la valeur LOCALE pending, pas l’ancienne valeur distante', resolved?.texte === 'Nouvelle valeur (pas encore poussée)', resolved?.texte);
}

console.log('\n[H] CHANTIER SYNC — delete pensée offline → boot avec l’entité encore présente côté remote → ne réapparaît jamais');
{
  const stillOnRemote = makePensee({ id: 'p-3', texte: 'Supprimée localement, pas encore côté serveur' });
  const outbox: Outbox = [{ opId: 'op-h', kind: 'pensee', entityId: 'p-3', action: 'delete', enqueuedAt: '2026-01-01T00:00:00.000Z' }];
  const result = resolveBootData({
    cachedContacts: [],
    cachedPensees: [], // déjà retirée localement (suppression optimiste)
    outbox,
    remote: { contacts: [], pensees: [stillOnRemote] },
  });
  check('la pensée supprimée ne réapparaît pas malgré sa présence distante', !result.pensees.some((p) => p.id === 'p-3'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
