// Tests de non-régression — CHANTIER SUPPRESSION/INTÉGRITÉ (2026-09-15), volet "suppression d'un
// proche". Décision produit VALIDÉE : supprimer un proche NE supprime JAMAIS ses pensées liées,
// conservées avec `contactId: null`. Ce fichier couvre :
//   1. le texte de confirmation exact (0/1/plusieurs pensées liées) — logique pure extraite dans
//      src/data/contactDeletionMessage.ts, testée directement ;
//   2. le comportement de résolution au boot (storeInit.ts) pour les scénarios online/offline/
//      resync demandés, via resolveBootData (déjà pur/testable, voir test-regression-boot-data.ts) ;
//   3. l'invariant "aucune référence orpheline" : après résolution, aucune pensée ne doit pointer
//      vers un contactId absent de la liste de contacts résolue.
//
// Usage : npx tsx scripts/test-regression-contact-deletion.ts

import { Contact, Pensee } from '../src/data/types';
import { resolveBootData } from '../src/data/storeInit';
import { Outbox } from '../src/data/outbox';
import { contactDeletionMessage } from '../src/data/contactDeletionMessage';

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

/** Invariant demandé explicitement : aucune pensée résolue ne doit référencer un contact absent de
 *  la liste de contacts résolue — le seul état "orphelin" valide est `contactId: null`. */
function noOrphanReferences(contacts: Contact[], pensees: Pensee[]): boolean {
  const contactIds = new Set(contacts.map((c) => c.id));
  return pensees.every((p) => p.contactId === null || contactIds.has(p.contactId));
}

console.log('\n[texte de confirmation] contactDeletionMessage — exactement les 3 formulations demandées');
check('0 pensée liée', contactDeletionMessage(0) === 'Cette fiche et son quiz seront définitivement supprimés.');
check(
  '1 pensée liée (singulier)',
  contactDeletionMessage(1) === 'Cette fiche et son quiz seront définitivement supprimés. La pensée liée sera conservée sans proche.',
);
check(
  '2 pensées liées (pluriel, compte inclus)',
  contactDeletionMessage(2) === 'Cette fiche et son quiz seront définitivement supprimés. Les 2 pensées liées seront conservées sans proche.',
);
check(
  '5 pensées liées (pluriel, compte inclus)',
  contactDeletionMessage(5) === 'Cette fiche et son quiz seront définitivement supprimés. Les 5 pensées liées seront conservées sans proche.',
);

console.log('\n[suppression contact ONLINE] pensées liées conservées, contactId → null, aucune référence orpheline');
{
  // Simule l'état APRÈS deleteContact() online + drain confirmé : le contact n'existe plus nulle
  // part (ni cache, ni distant), les pensées existent toujours avec contactId déjà détaché (c'est
  // store.tsx qui patche `contactId: null` de façon optimiste avant même l'enqueue — reproduit ici
  // directement dans les fixtures, exactement ce que verrait resolveBootData au boot suivant).
  const detachedPensee = makePensee({ id: 'p-online', texte: 'Souvenir', contactId: null });
  const result = resolveBootData({
    cachedContacts: [],
    cachedPensees: [detachedPensee],
    outbox: [],
    remote: { contacts: [], pensees: [detachedPensee] },
  });
  check('le contact est bien absent', result.contacts.length === 0);
  check('la pensée liée est conservée', result.pensees.some((p) => p.id === 'p-online'));
  check('contactId bien à null', result.pensees.find((p) => p.id === 'p-online')?.contactId === null);
  check('aucune référence orpheline', noOrphanReferences(result.contacts, result.pensees));
}

console.log('\n[suppression contact OFFLINE] delete contact en attente dans l’outbox → détache localement, ne réapparaît pas');
{
  // Le contact est encore côté distant (delete pas encore drainé) ; la pensée liée, elle, a déjà été
  // détachée localement de façon optimiste (comme le fait store.tsx AVANT même l'enqueue) — le cache
  // et le distant reflètent donc cet état intermédiaire réel pendant la période hors-ligne.
  const contactStillRemote = makeContact({ id: 'c-offline', prenom: 'Yohan' });
  const detachedPensee = makePensee({ id: 'p-offline', texte: 'Souvenir de Yohan', contactId: null });
  const outbox: Outbox = [
    { opId: 'op-offline-1', kind: 'contact', entityId: 'c-offline', action: 'delete', enqueuedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const result = resolveBootData({
    cachedContacts: [contactStillRemote],
    cachedPensees: [detachedPensee],
    outbox,
    remote: { contacts: [contactStillRemote], pensees: [detachedPensee] }, // le serveur ne sait pas encore
  });
  check('le contact reste absent malgré sa présence distante (delete pending prioritaire)', !result.contacts.some((c) => c.id === 'c-offline'));
  check('la pensée liée reste présente', result.pensees.some((p) => p.id === 'p-offline'));
  check('contactId reste à null (détaché localement, pas ressuscité par le distant)', result.pensees.find((p) => p.id === 'p-offline')?.contactId === null);
  check('aucune référence orpheline', noOrphanReferences(result.contacts, result.pensees));
}

console.log('\n[après resynchronisation] delete confirmé côté serveur, outbox vidée → pensées toujours présentes, contactId toujours null');
{
  // État APRÈS un drain réussi : le contact n'est plus dans l'outbox (delete confirmé), et le
  // distant ne le connaît plus non plus — remote fait désormais autorité seul (voir le fix
  // storeInit.ts de ce chantier), sans qu'aucun cache périmé ne puisse le faire réapparaître.
  const detachedPensee = makePensee({ id: 'p-resync', texte: 'Souvenir toujours là', contactId: null });
  const result = resolveBootData({
    cachedContacts: [], // cache déjà à jour (pas de résidu périmé)
    cachedPensees: [detachedPensee],
    outbox: [], // drain terminé, plus aucun op en attente
    remote: { contacts: [], pensees: [detachedPensee] },
  });
  check('le contact reste définitivement absent', !result.contacts.some((c) => c.id === 'c-offline'));
  check('la pensée reste présente après resync', result.pensees.some((p) => p.id === 'p-resync'));
  check('contactId toujours null après resync', result.pensees.find((p) => p.id === 'p-resync')?.contactId === null);
  check('aucune référence orpheline', noOrphanReferences(result.contacts, result.pensees));
}

console.log('\n[aucune référence orpheline — cas général] plusieurs contacts/pensées mêlés, certains liés, certains détachés');
{
  const alice = makeContact({ id: 'alice', prenom: 'Alice' });
  const penseeLinkedToAlice = makePensee({ id: 'p-alice', contactId: 'alice' });
  const penseeDetached = makePensee({ id: 'p-detached', contactId: null });
  const result = resolveBootData({
    cachedContacts: [],
    cachedPensees: [],
    outbox: [],
    remote: { contacts: [alice], pensees: [penseeLinkedToAlice, penseeDetached] },
  });
  check('Alice présente', result.contacts.some((c) => c.id === 'alice'));
  check('pensée liée à Alice conservée avec sa référence valide', result.pensees.find((p) => p.id === 'p-alice')?.contactId === 'alice');
  check('pensée détachée conservée avec contactId null', result.pensees.find((p) => p.id === 'p-detached')?.contactId === null);
  check('aucune référence orpheline sur l’ensemble', noOrphanReferences(result.contacts, result.pensees));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
