// Tests de non-régression — CHANTIER SYNC OFFLINE→SUPABASE (outbox persistante, coalescing,
// drain). Teste `src/data/outbox.ts`, pur, sans dépendance AsyncStorage/Supabase/react-native — un
// exécuteur factice (`fakeExecutor`) simule les appels réseau pour les scénarios de drain (C/I/J/K),
// sans jamais toucher au vrai Supabase. Lecture seule — aucune donnée n'est modifiée par ce script.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-outbox.ts

import { Contact, Pensee } from '../src/data/types';
import {
  Outbox,
  OutboxOp,
  drainOutbox,
  enqueueDeleteContact,
  enqueueDeletePensee,
  enqueueUpsertContact,
  enqueueUpsertPensee,
} from '../src/data/outbox';

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

let opCounter = 0;
function opId() {
  opCounter += 1;
  return `op-${opCounter}`;
}
const NOW = '2026-01-01T00:00:00.000Z';

function fakeExecutor(script: Record<string, boolean> = {}) {
  const calls: string[] = [];
  const executeOp = async (op: OutboxOp): Promise<{ ok: boolean }> => {
    const ok = script[op.opId] ?? true;
    calls.push(op.opId);
    return { ok };
  };
  return { calls, executeOp };
}

async function main() {
  console.log('\n[D] 3 modifications offline de la même pensée → un seul upsert final, dernier texte gagnant');
  {
    let outbox: Outbox = [];
    const p1 = makePensee({ id: 'p-d', texte: 'v1' });
    const p2 = { ...p1, texte: 'v2' };
    const p3 = { ...p1, texte: 'v3' };
    outbox = enqueueUpsertPensee(outbox, p1, false, opId(), NOW);
    outbox = enqueueUpsertPensee(outbox, p2, false, opId(), NOW);
    outbox = enqueueUpsertPensee(outbox, p3, false, opId(), NOW);
    check('un seul op dans l’outbox pour cette pensée', outbox.filter((o) => o.entityId === 'p-d').length === 1, String(outbox.length));
    const op = outbox.find((o) => o.entityId === 'p-d');
    check('le payload est bien le dernier (v3)', op?.kind === 'pensee' && op.action === 'upsert' && op.payload.texte === 'v3');
  }

  console.log('\n[E] create offline → update offline → un seul upsert, isNew:true préservé, état final');
  {
    let outbox: Outbox = [];
    const created = makePensee({ id: 'p-e', texte: 'contenu initial' });
    outbox = enqueueUpsertPensee(outbox, created, true, opId(), NOW);
    const edited = { ...created, texte: 'contenu édité avant toute synchro' };
    outbox = enqueueUpsertPensee(outbox, edited, false, opId(), NOW); // false : l'appelant croit que c'est un update classique
    check('un seul op pour cette pensée', outbox.filter((o) => o.entityId === 'p-e').length === 1);
    const op = outbox.find((o) => o.entityId === 'p-e');
    check('isNew reste true (jamais confirmée côté serveur, doit rester une création)', op?.action === 'upsert' && op.isNew === true);
    check(
      'le payload est le texte édité (état final)',
      op?.kind === 'pensee' && op.action === 'upsert' && op.payload.texte === 'contenu édité avant toute synchro',
    );
  }

  console.log('\n[F] create offline → delete avant toute synchro → aucune opération réseau nécessaire (outbox vidée pour cette entité)');
  {
    let outbox: Outbox = [];
    const created = makeContact({ id: 'c-f' });
    outbox = enqueueUpsertContact(outbox, created, true, opId(), NOW);
    outbox = enqueueDeleteContact(outbox, 'c-f', opId(), NOW);
    check('aucun op restant pour cette entité (jamais existé côté serveur)', !outbox.some((o) => o.entityId === 'c-f'));
  }

  console.log('\n[G] update d’une entité déjà distante → delete offline → seul le delete est conservé');
  {
    let outbox: Outbox = [];
    const existing = makeContact({ id: 'c-g' });
    outbox = enqueueUpsertContact(outbox, { ...existing, prenom: 'Modifié' }, false, opId(), NOW);
    outbox = enqueueDeleteContact(outbox, 'c-g', opId(), NOW);
    const ops = outbox.filter((o) => o.entityId === 'c-g');
    check('un seul op restant', ops.length === 1, String(ops.length));
    check('c’est bien un delete (pas l’update)', ops[0]?.action === 'delete');
  }

  console.log('\n[I] échec réseau pendant le drain → l’opération en échec (et les suivantes) restent persistées');
  {
    const opFail = opId();
    const opAfter = opId();
    let outbox: Outbox = [];
    outbox = enqueueUpsertContact(outbox, makeContact({ id: 'c-i1' }), true, opFail, NOW);
    outbox = enqueueUpsertContact(outbox, makeContact({ id: 'c-i2' }), true, opAfter, NOW);
    const { executeOp } = fakeExecutor({ [opFail]: false });
    const result = await drainOutbox(outbox, executeOp);
    check('l’opération en échec est toujours dans l’outbox', result.outbox.some((o) => o.opId === opFail));
    check('l’opération suivante (jamais tentée) est aussi conservée, ordre respecté', result.outbox.some((o) => o.opId === opAfter));
    check('stoppedEarly signalé', result.stoppedEarly === true);
  }

  console.log('\n[J] succès réseau → l’opération n’est retirée qu’APRÈS confirmation, jamais avant');
  {
    const id = opId();
    let outbox: Outbox = [];
    outbox = enqueueUpsertPensee(outbox, makePensee({ id: 'p-j' }), true, id, NOW);
    const { calls, executeOp } = fakeExecutor();
    const result = await drainOutbox(outbox, executeOp);
    check('l’exécuteur a bien été appelé avant toute suppression', calls.length === 1 && calls[0] === id);
    check('l’opération est retirée après le succès confirmé', !result.outbox.some((o) => o.opId === id));
  }

  console.log('\n[C] retour online → drain → outbox vidée (équivalent applicatif du succès de drain, côté store.tsx)');
  {
    let outbox: Outbox = [];
    outbox = enqueueUpsertPensee(outbox, makePensee({ id: 'p-c' }), false, opId(), NOW);
    const { executeOp } = fakeExecutor();
    const result = await drainOutbox(outbox, executeOp);
    check('outbox complètement vidée après un drain entièrement réussi', result.outbox.length === 0);
  }

  console.log('\n[K] plusieurs entités en attente → ordre FIFO conservé pendant le drain');
  {
    const order: string[] = [];
    let outbox: Outbox = [];
    const idA = opId();
    const idB = opId();
    const idC = opId();
    outbox = enqueueUpsertContact(outbox, makeContact({ id: 'c-k-a' }), true, idA, NOW);
    outbox = enqueueUpsertPensee(outbox, makePensee({ id: 'p-k-b' }), true, idB, NOW);
    outbox = enqueueDeleteContact(outbox, 'c-k-nonexistent', idC, NOW);
    const executeOp = async (op: OutboxOp) => {
      order.push(op.opId);
      return { ok: true };
    };
    await drainOutbox(outbox, executeOp);
    check('les 3 opérations sont traitées dans l’ordre d’enqueue', order.join(',') === [idA, idB, idC].join(','), order.join(','));
  }

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
