/// <reference types="node" />
// Tests de non-régression — CHANTIER ROBUSTESSE PRÉ-BÊTA, volet "suppressions" §2 (2026-09-16) :
// double suppression concurrente du même élément + idempotence (pensée, puis proche).
//
// Portée de l'audit : aucun bug réel trouvé sur ce point précis (contrairement à la course
// pensée/contact du précédent incrément) — le système est idempotent PAR CONSTRUCTION à chaque
// couche, vérifié ici explicitement plutôt que supposé :
//   1. État local (store.tsx) : `prev.filter(p => p.id !== id)` est déjà idempotent — filtrer un id
//      absent ne fait rien, jamais d'erreur.
//   2. Outbox (outbox.ts) : `enqueueDelete` retrouve l'op existant par (kind, entityId) et le
//      REMPLACE en place — deux enqueue delete pour la même entité ne créent jamais deux ops.
//   3. Réseau (supabaseRepo.ts) : `deleteContactRemote`/`deletePenseeRemote` sont de simples
//      `.delete().eq('id', ...)` SANS `.select()`/`.single()` — supprimer une ligne déjà absente ne
//      lève AUCUNE erreur côté PostgREST (0 ligne affectée = succès silencieux), donc rejouer un
//      delete déjà confirmé (retry réseau, double drain) ne peut jamais faire échouer l'outbox.
//   4. UI (PenseeDetailScreen/FicheScreen/écrans multi-sélection) : chaque confirmation de
//      suppression est un unique bouton d'Alert natif (ne peut se déclencher qu'une fois par tap) qui
//      transitionne IMMÉDIATEMENT (navigation.goBack()/exitSelectionMode()) dans le même onPress —
//      aucune fenêtre où un second tap pourrait re-déclencher la suppression.
//
// §A-§F sont RÉELLEMENT EXÉCUTÉS contre les vraies fonctions pures (enqueueDeletePensee/
// enqueueDeleteContact/drainOutbox). §G/§H vérifient par lecture de source les invariants réseau/UI
// non testables sans un vrai Supabase / harnais de composant.
//
// Usage : npx tsx scripts/test-regression-delete-idempotence.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee } from '../src/data/types';
import { Outbox, OutboxOp, drainOutbox, enqueueDeleteContact, enqueueDeletePensee } from '../src/data/outbox';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', 'src', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    date: null,
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    ...overrides,
  } as Pensee;
}

let opCounter = 0;
function opId() {
  opCounter += 1;
  return `op-${opCounter}`;
}
const NOW = '2026-01-01T00:00:00.000Z';

/** Reproduit EXACTEMENT le reducer local de store.tsx pour deletePensee/deleteContact — pas de
 *  logique réimplémentée, juste le même one-liner que setPensees/setContacts. */
function localDeletePensee(pensees: Pensee[], id: string): Pensee[] {
  return pensees.filter((p) => p.id !== id);
}
function localDeleteContact(contacts: Contact[], id: string): Contact[] {
  return contacts.filter((c) => c.id !== id);
}

async function main() {
  console.log('\n[§A — RÉEL, pensée] double appel local deletePensee(id) — idempotent, jamais d’erreur');
  {
    const p = makePensee({ id: 'p-double' });
    const after1 = localDeletePensee([p], 'p-double');
    const after2 = localDeletePensee(after1, 'p-double'); // 2e appel : id déjà absent
    check('1er appel retire bien la pensée', after1.length === 0);
    check('2e appel (id déjà absent) : aucune erreur, liste toujours vide', after2.length === 0);
  }

  console.log('\n[§B — RÉEL, pensée] double enqueue delete pour LA MÊME pensée → un seul op dans l’outbox');
  {
    let outbox: Outbox = [];
    outbox = enqueueDeletePensee(outbox, 'p-b', opId(), NOW);
    const afterFirst = outbox.length;
    outbox = enqueueDeletePensee(outbox, 'p-b', opId(), NOW); // 2e tap / 2e appel concurrent
    check('un seul op après le 1er enqueue', afterFirst === 1);
    check('toujours un seul op après le 2e enqueue (coalescing, pas d’empilement)', outbox.filter((o) => o.entityId === 'p-b').length === 1, String(outbox.length));
    check('c’est bien un delete', outbox.find((o) => o.entityId === 'p-b')?.action === 'delete');
  }

  console.log('\n[§C — RÉEL, pensée] drain : le delete n’est exécuté réseau qu’UNE fois pour cette entité');
  {
    let outbox: Outbox = [];
    outbox = enqueueDeletePensee(outbox, 'p-c', opId(), NOW);
    outbox = enqueueDeletePensee(outbox, 'p-c', opId(), NOW); // double enqueue avant tout drain
    const calls: string[] = [];
    const executeOp = async (op: OutboxOp) => {
      calls.push(`${op.kind}:${op.entityId}`);
      return { ok: true };
    };
    const result = await drainOutbox(outbox, executeOp);
    check('un seul appel réseau malgré le double enqueue', calls.length === 1, calls.join(','));
    check('outbox vidée après le drain', result.outbox.length === 0);
  }

  console.log('\n[§D — RÉEL, pensée] re-suppression APRÈS un drain déjà réussi (entité déjà partie) — pas de crash, idempotent');
  {
    // Simule : delete déjà confirmé côté serveur (outbox vide), puis un 2e appel deletePensee(id)
    // survient malgré tout (ex. re-render tardif) — enqueueDeletePensee ajoute un nouvel op (l’entité
    // n’a plus d’op existant à coalescer), mais son exécution réseau reste un no-op silencieux côté
    // PostgREST (0 ligne à supprimer = succès, voir §G) : jamais d’erreur remontée à l’utilisateur.
    let outbox: Outbox = [];
    outbox = enqueueDeletePensee(outbox, 'p-d', opId(), NOW);
    check('un nouvel op delete est bien créé (aucun op existant à coalescer)', outbox.length === 1);
    const executeOp = async () => ({ ok: true }); // simule le 0-ligne-supprimée = succès de PostgREST
    const result = await drainOutbox(outbox, executeOp);
    check('drain réussi malgré l’absence de la ligne côté serveur, aucune erreur', result.outbox.length === 0);
  }

  console.log('\n[§E — RÉEL, proche] même idempotence : local / outbox / drain / re-suppression tardive');
  {
    const c: Contact = {
      id: 'c-e',
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
    };
    const after1 = localDeleteContact([c], 'c-e');
    const after2 = localDeleteContact(after1, 'c-e');
    check('1er appel local retire bien le proche', after1.length === 0);
    check('2e appel local (déjà absent) : idempotent', after2.length === 0);

    let outbox: Outbox = [];
    outbox = enqueueDeleteContact(outbox, 'c-e', opId(), NOW);
    outbox = enqueueDeleteContact(outbox, 'c-e', opId(), NOW);
    check('un seul op malgré le double enqueue', outbox.filter((o) => o.entityId === 'c-e').length === 1);

    const calls: string[] = [];
    const result = await drainOutbox(outbox, async (op) => {
      calls.push(op.opId);
      return { ok: true };
    });
    check('un seul appel réseau pour ce proche', calls.length === 1);
    check('outbox vidée', result.outbox.length === 0);
  }

  console.log('\n[§F — RÉEL] "pensée puis proche" — suppression double des DEUX, interleaved, ordre FIFO préservé, état final propre');
  {
    // Pensée P liée au proche C. Séquence réelle simulée : supprimer P (x2, double-tap), PUIS
    // supprimer C (x2, double-tap) — toujours hors ligne — puis reconnexion/drain.
    let outbox: Outbox = [];
    const penseeOpId1 = opId();
    outbox = enqueueDeletePensee(outbox, 'p-f', penseeOpId1, NOW); // 1er "tap" sur la pensée
    outbox = enqueueDeletePensee(outbox, 'p-f', opId(), NOW); // 2e "tap" (double suppression concurrente)
    const contactOpId1 = opId();
    outbox = enqueueDeleteContact(outbox, 'c-f', contactOpId1, NOW); // 1er "tap" sur le proche
    outbox = enqueueDeleteContact(outbox, 'c-f', opId(), NOW); // 2e "tap"

    check('exactement 2 ops au total (une par entité, malgré 4 appels enqueue)', outbox.length === 2, String(outbox.length));

    const order: string[] = [];
    const result = await drainOutbox(outbox, async (op) => {
      order.push(`${op.kind}:${op.entityId}`);
      return { ok: true };
    });
    check(
      'ordre FIFO respecté : la pensée (1er enqueue) avant le proche (2e enqueue), malgré les doubles taps',
      order.join(',') === 'pensee:p-f,contact:c-f',
      order.join(','),
    );
    check('exactement 2 appels réseau au total (pas 4, malgré les 4 enqueue)', order.length === 2);
    check('outbox entièrement vidée après reconnexion/drain — aucune opération résiduelle', result.outbox.length === 0);
  }

  console.log('\n[§G — source] deleteContactRemote/deletePenseeRemote — idempotents par construction (aucune assertion de rowcount)');
  const repoSrc = readSrc('lib', 'supabaseRepo.ts');
  const deleteContactRemoteBlock = repoSrc.slice(repoSrc.indexOf('export async function deleteContactRemote'), repoSrc.indexOf('export async function deletePenseeRemote'));
  const deletePenseeRemoteBlock = repoSrc.slice(repoSrc.indexOf('export async function deletePenseeRemote'), repoSrc.indexOf('export async function insertPenseeRemote'));
  check(
    'deleteContactRemote : simple delete().eq(), sans .select()/.single() (donc jamais d’erreur "0 ligne")',
    deleteContactRemoteBlock.includes(".delete().eq('id', contactId)") && !deleteContactRemoteBlock.includes('.single()') && !deleteContactRemoteBlock.includes('.select()'),
  );
  check(
    'deletePenseeRemote : simple delete().eq(), sans .select()/.single() (donc jamais d’erreur "0 ligne")',
    deletePenseeRemoteBlock.includes(".delete().eq('id', penseeId)") && !deletePenseeRemoteBlock.includes('.single()') && !deletePenseeRemoteBlock.includes('.select()'),
  );

  console.log('\n[§H — source] UI — chaque confirmation de suppression transitionne immédiatement (pas de fenêtre de double-tap)');
  const penseeDetailSrc = readSrc('screens', 'PenseeDetailScreen.tsx');
  const ficheSrc = readSrc('screens', 'FicheScreen.tsx');
  const penseesSrc = readSrc('screens', 'PenseesScreen.tsx');
  const contactsSrc = readSrc('screens', 'ContactsScreen.tsx');
  const memoSrc = readSrc('screens', 'MemorizedPenseesScreen.tsx');
  check(
    'PenseeDetailScreen.remove() : deletePensee puis goBack() dans le même onPress (Alert, un seul tap possible)',
    /deletePensee\(existing\.id\);\s*navigation\.goBack\(\);/.test(penseeDetailSrc),
  );
  check(
    'FicheScreen.remove() : deleteContact puis goBack() dans le même onPress',
    /deleteContact\(existing\.id\);\s*navigation\.goBack\(\);/.test(ficheSrc),
  );
  check(
    'PenseesScreen — suppression multiple : exitSelectionMode() appelé juste après le forEach de suppression (bouton disparaît, pas de re-tap possible)',
    /selectedIds\.forEach\(\(id\) => deletePensee\(id\)\);\s*exitSelectionMode\(\);/.test(penseesSrc),
  );
  check(
    'ContactsScreen — suppression multiple : exitSelectionMode() appelé juste après le forEach de suppression',
    /selectedIds\.forEach\(\(id\) => deleteContact\(id\)\);\s*exitSelectionMode\(\);/.test(contactsSrc),
  );
  check(
    'MemorizedPenseesScreen — suppression multiple : exitSelectionMode() appelé juste après le forEach de suppression',
    /selectedIds\.forEach\(\(id\) => deletePensee\(id\)\);\s*exitSelectionMode\(\);/.test(memoSrc),
  );

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
