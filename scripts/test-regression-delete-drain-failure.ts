/// <reference types="node" />
// Tests de non-régression — CHANTIER ROBUSTESSE PRÉ-BÊTA, volet "suppressions" §5 (2026-09-16) :
// suppressions quand une erreur réseau/Supabase survient PENDANT le drain, en particulier au milieu
// de plusieurs suppressions. Portée de l'audit : aucun nouveau bug trouvé au-delà de celui déjà
// corrigé (voir test-regression-outbox-multidelete-drain-loop.ts) — ce fichier verrouille
// explicitement les 4 garanties demandées : état local cohérent, opérations non exécutées toujours
// dans l'outbox, aucune perte, reconnexion propre SANS recréer un élément supprimé.
//
// Tout est RÉELLEMENT EXÉCUTÉ contre les vraies fonctions pures (enqueueDeletePensee/
// enqueueDeleteContact/drainOutbox/resolveBootData), avec un harnais qui reproduit fidèlement l'état
// local (`pensees`/`contacts`, filtrage optimiste à l'enqueue — jamais un rollback en cas d'échec
// réseau, exactement le comportement de store.tsx) ET le drain en boucle de `drainNow()` (voir le
// fichier ci-dessus pour la preuve que cette boucle est correcte).
//
// Usage : npx tsx scripts/test-regression-delete-drain-failure.ts

import { Contact, Pensee } from '../src/data/types';
import { resolveBootData } from '../src/data/storeInit';
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

let opCounter = 0;
function opId() {
  opCounter += 1;
  return `op-${opCounter}`;
}
const NOW = '2026-01-01T00:00:00.000Z';

/** Reproduit `drainNow()` (store.tsx, version corrigée en boucle) — voir
 *  test-regression-outbox-multidelete-drain-loop.ts pour la preuve que ce pattern est correct. */
async function loopedDrain(outboxRef: { current: Outbox }, executeOp: (op: OutboxOp) => Promise<{ ok: boolean }>) {
  for (;;) {
    const snapshot = outboxRef.current;
    if (snapshot.length === 0) return;
    const result = await drainOutbox(snapshot, executeOp);
    const succeededOpIds = new Set(snapshot.filter((op) => !result.outbox.some((o) => o.opId === op.opId)).map((op) => op.opId));
    if (succeededOpIds.size > 0) {
      outboxRef.current = outboxRef.current.filter((op) => !succeededOpIds.has(op.opId));
    }
    if (result.stoppedEarly) return;
  }
}

async function main() {
  console.log('\n[§A — RÉEL] 3 suppressions de pensées ensemble, panne réseau au milieu : état local, outbox, aucune perte');
  {
    // État local AVANT toute suppression — 3 pensées.
    let pensees = [makePensee({ id: 'p1' }), makePensee({ id: 'p2' }), makePensee({ id: 'p3' })];

    // Sélection multiple + Supprimer : exactement comme store.tsx, le retrait local est OPTIMISTE et
    // IMMÉDIAT pour les 3, indépendamment de ce que le réseau fera ensuite (jamais de rollback).
    const toDelete = ['p1', 'p2', 'p3'];
    pensees = pensees.filter((p) => !toDelete.includes(p.id));
    check('les 3 pensées disparaissent immédiatement de l’état local (optimiste)', pensees.length === 0);

    let outbox: Outbox = [];
    const opIds: Record<string, string> = {};
    for (const id of toDelete) {
      const id_ = opId();
      opIds[id] = id_;
      outbox = enqueueDeletePensee(outbox, id, id_, NOW);
    }
    const outboxRef = { current: outbox };
    const networkCalls: string[] = [];
    const executeOp = async (op: OutboxOp) => {
      networkCalls.push(op.entityId);
      // p2 échoue (coupure réseau/erreur Supabase simulée EN PLEIN MILIEU des 3 suppressions).
      return { ok: op.entityId !== 'p2' };
    };
    await loopedDrain(outboxRef, executeOp);

    check('p1 traité avec succès AVANT la panne', networkCalls.includes('p1'));
    check('p2 tenté et a échoué (panne simulée)', networkCalls.includes('p2'));
    check('p3 JAMAIS tenté (ordre FIFO, arrêt à la 1ère erreur — pas de saut d’opération)', !networkCalls.includes('p3'));
    check('p1 retiré de l’outbox (confirmé serveur)', !outboxRef.current.some((o) => o.entityId === 'p1'));
    check('p2 reste dans l’outbox (échec, à retenter)', outboxRef.current.some((o) => o.entityId === 'p2' && o.action === 'delete'));
    check('p3 reste AUSSI dans l’outbox (jamais tenté, mais jamais perdu non plus)', outboxRef.current.some((o) => o.entityId === 'p3' && o.action === 'delete'));
    check('aucune opération perdue au total : exactement 2 restantes (p2, p3)', outboxRef.current.length === 2, String(outboxRef.current.length));
    check('l’état local reste cohérent malgré l’échec : les 3 pensées restent absentes localement (jamais de rollback)', pensees.length === 0);

    console.log('  → reconnexion (retry) : le réseau revient, p2 et p3 réussissent cette fois');
    const networkCallsRetry: string[] = [];
    const executeOpRetry = async (op: OutboxOp) => {
      networkCallsRetry.push(op.entityId);
      return { ok: true };
    };
    await loopedDrain(outboxRef, executeOpRetry);
    check('p1 n’est PAS re-tenté au retry (déjà confirmé avant la panne, pas de doublon d’appel)', !networkCallsRetry.includes('p1'));
    check('p2 et p3 traités au retry, dans l’ordre FIFO d’origine', networkCallsRetry.join(',') === 'p2,p3', networkCallsRetry.join(','));
    check('outbox entièrement vidée après la reconnexion', outboxRef.current.length === 0);
  }

  console.log('\n[§B — RÉEL] suppression d’un proche : panne réseau pendant le drain → reconnexion ne le recrée jamais');
  {
    const contact = makeContact({ id: 'c-fail', prenom: 'Yohan' });
    const linkedPensee = makePensee({ id: 'p-linked', contactId: null }); // déjà détachée localement (optimiste)

    let outbox: Outbox = enqueueDeleteContact([], 'c-fail', opId(), NOW);
    const outboxRef = { current: outbox };

    // 1ère tentative : panne réseau/Supabase pendant ce drain.
    let attempt = 0;
    const executeOpFlaky = async (op: OutboxOp) => {
      attempt += 1;
      return { ok: attempt > 1 }; // échoue la 1ère fois, réussirait ensuite
    };
    await loopedDrain(outboxRef, executeOpFlaky);
    check('le delete du proche reste dans l’outbox après l’échec', outboxRef.current.some((o) => o.entityId === 'c-fail'));

    // Pendant cette période, si l’app redémarre (cold start), resolveBootData doit voir le distant
    // ENCORE avec le contact (le delete n’a jamais atteint le serveur) mais ne JAMAIS le ressusciter,
    // grâce au delete toujours présent dans l’outbox persistée.
    const bootDuringFailure = resolveBootData({
      cachedContacts: [], // déjà retiré localement (optimiste, avant même l’enqueue)
      cachedPensees: [linkedPensee],
      outbox: outboxRef.current,
      remote: { contacts: [contact], pensees: [linkedPensee] }, // le serveur ne sait toujours rien
    });
    check('le proche reste absent au boot suivant malgré sa présence distante (delete pending protège)', !bootDuringFailure.contacts.some((c) => c.id === 'c-fail'));
    check('la pensée liée reste présente, toujours détachée (contactId null)', bootDuringFailure.pensees.find((p) => p.id === 'p-linked')?.contactId === null);

    // 2. Reconnexion : le drain est retenté et réussit cette fois.
    const executeOpRetry = async () => ({ ok: true });
    await loopedDrain(outboxRef, executeOpRetry);
    check('outbox vidée après le retry réussi', outboxRef.current.length === 0);

    // 3. Boot final (après confirmation serveur) : remote fait enfin autorité seul, plus d’outbox à
    //    appliquer — le proche reste absent, la pensée reste détachée. Pas de résurrection.
    const bootAfterSuccess = resolveBootData({
      cachedContacts: [],
      cachedPensees: [linkedPensee],
      outbox: [],
      remote: { contacts: [], pensees: [linkedPensee] }, // le serveur a maintenant confirmé la suppression
    });
    check('le proche reste définitivement absent après confirmation serveur', !bootAfterSuccess.contacts.some((c) => c.id === 'c-fail'));
    check('la pensée liée reste présente et détachée après resync complète', bootAfterSuccess.pensees.find((p) => p.id === 'p-linked')?.contactId === null);
  }

  console.log('\n[§C — RÉEL] échec réseau pur (aucune réponse serveur, exception) — traité identiquement à un refus explicite, rien perdu');
  {
    // `executeOutboxOp` (store.tsx) catch TOUTE exception et retourne {ok:false} de façon identique
    // à un refus explicite — reproduit ici directement (voir le commentaire de executeOutboxOp dans
    // store.tsx : "Pensif n'a actuellement aucun moyen fiable de distinguer une vraie erreur
    // applicative d'une coupure réseau").
    let outbox: Outbox = enqueueDeletePensee([], 'p-network-down', opId(), NOW);
    const outboxRef = { current: outbox };
    const executeOpThrows = async (): Promise<{ ok: boolean }> => {
      try {
        throw new Error('Network request failed');
      } catch {
        return { ok: false };
      }
    };
    await loopedDrain(outboxRef, executeOpThrows);
    check('l’opération reste dans l’outbox après une exception réseau, sans crash du drain', outboxRef.current.some((o) => o.entityId === 'p-network-down'));
  }

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
