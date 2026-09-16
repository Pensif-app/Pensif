/// <reference types="node" />
// Tests de non-régression — CHANTIER ROBUSTESSE PRÉ-BÊTA (2026-09-16), volet "suppressions" §1 :
// course entre une création de pensée pas encore synchronisée et la suppression (offline) du proche
// qu'elle référence.
//
// Bug découvert par audit (pas signalé par l'utilisateur, trouvé en relisant store.tsx avant de
// commencer les tests robustesse) : `executeOutboxOp` (store.tsx), après un INSERT réussi
// (`isNew: true`), réécrivait l'entité locale avec l'objet renvoyé par le serveur — construit à
// partir du PAYLOAD figé au moment de l'enqueue. Scénario réel :
//   1. Pensée créée hors ligne, liée au contact X (`contactId: X`) → outbox = [pensee-upsert(X)].
//   2. Toujours hors ligne, le proche X est supprimé → deleteContact() détache OPTIMISTEMENT la
//      pensée en mémoire (`contactId: null`) et enqueue [pensee-upsert(X), contact-delete(X)]
//      (ordre FIFO = ordre chronologique réel des actions utilisateur).
//   3. Retour réseau, drain FIFO : le pensee-upsert (payload PÉRIMÉ, contactId=X) s'exécute EN
//      PREMIER et réussissait à écrire côté serveur (le contact existe encore à cet instant) — puis
//      l'ancien code réécrivait l'état local avec cet écho, ANNULANT silencieusement le détachement
//      fait à l'étape 2. Le contact-delete suivant nullifie bien `contact_id` CÔTÉ SERVEUR (`on
//      delete set null`), mais plus rien ne re-synchronisait l'état local ensuite : la pensée restait
//      affichée avec `contactId: X` (un proche qui n'existe plus nulle part localement), alors que le
//      serveur, lui, avait bien `contact_id = null`. Corrigé en ne réécrivant plus JAMAIS l'état local
//      après un insert réussi (`insertContactRemote`/`insertPenseeRemote` ne font qu'échoïr le
//      payload envoyé — aucun champ généré serveur à rapatrier, voir supabaseRepo.ts).
//
// §A est RÉELLEMENT EXÉCUTÉ contre les vraies fonctions pures (enqueueUpsertPensee,
// enqueueDeleteContact, drainOutbox) — prouve que l'ORDRE FIFO garantit bien que la création (payload
// périmé) s'exécute avant la suppression du contact dans ce scénario, condition nécessaire au bug
// original ET à sa correction (le fix retire seulement la réécriture locale, pas l'ordre). §B vérifie
// par lecture de source que store.tsx ne réécrit plus l'état local après un insert réussi.
//
// Usage : npx tsx scripts/test-regression-outbox-contact-delete-race.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee } from '../src/data/types';
import { Outbox, OutboxOp, drainOutbox, enqueueDeleteContact, enqueueUpsertPensee } from '../src/data/outbox';

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

async function main() {
  console.log('\n[§A — RÉEL] création pensée→contact X, puis suppression de X : ordre FIFO préserve la causalité réelle');
  {
    // Étape 1 : pensée créée offline, liée au contact X — payload figé à l'enqueue (contactId: X),
    // EXACTEMENT comme le ferait addPensee() dans store.tsx.
    let outbox: Outbox = [];
    const penseeOpId = opId();
    const contactDeleteOpId = opId();
    const penseeCreatedWithContactX = makePensee({ id: 'p-race', contactId: 'contact-x' });
    outbox = enqueueUpsertPensee(outbox, penseeCreatedWithContactX, true, penseeOpId, NOW);

    // Étape 2 : toujours offline, le contact X est supprimé — enqueueDeleteContact ne touche PAS
    // l'op pensée déjà en attente (entités différentes), exactement le comportement réel.
    outbox = enqueueDeleteContact(outbox, 'contact-x', contactDeleteOpId, NOW);

    check('les 2 opérations coexistent dans l’outbox (entités différentes, pas de coalescing croisé)', outbox.length === 2);
    const penseeOp = outbox.find((o) => o.opId === penseeOpId);
    check(
      'le payload de la pensée reste celui figé à l’enqueue (contactId: X) — c’est CE payload périmé qui posait problème une fois écho localement',
      penseeOp?.kind === 'pensee' && penseeOp.action === 'upsert' && penseeOp.payload.contactId === 'contact-x',
    );

    // Étape 3 : drain FIFO — la création de la pensée doit s’exécuter AVANT la suppression du
    // contact (ordre chronologique réel des actions), condition nécessaire à la course décrite.
    const order: string[] = [];
    const executeOp = async (op: OutboxOp) => {
      order.push(op.opId);
      return { ok: true };
    };
    const result = await drainOutbox(outbox, executeOp);
    check(
      'FIFO : la création de la pensée (payload périmé) s’exécute AVANT la suppression du contact',
      order.join(',') === [penseeOpId, contactDeleteOpId].join(','),
      order.join(','),
    );
    check('drain entièrement réussi, outbox vidée', result.outbox.length === 0);
  }

  console.log('\n[§B — source] store.tsx ne réécrit plus l’état local avec l’écho serveur après un insert réussi');
  const storeSrc = readSrc('data', 'store.tsx');
  check(
    'création de contact : plus de setContacts((prev) => ... created ...) après insertContactRemote',
    !/setContacts\(\(prev\) => prev\.map\(\(c\) => \(c\.id === op\.entityId \? created/.test(storeSrc),
  );
  check(
    'création de pensée : plus de setPensees((prev) => ... created ...) après insertPenseeRemote',
    !/setPensees\(\(prev\) => prev\.map\(\(p\) => \(p\.id === op\.entityId \? created/.test(storeSrc),
  );
  check('insertContactRemote toujours appelé (juste sans réécriture locale du résultat)', storeSrc.includes('await insertContactRemote(userIdRef.current, rest);'));
  check('insertPenseeRemote toujours appelé (juste sans réécriture locale du résultat)', storeSrc.includes('await insertPenseeRemote(userIdRef.current, op.payload);'));
  check(
    'la modification (update, pas insert) d’une pensée/contact existant ne réécrivait DÉJÀ pas l’état local — non-régression, toujours le cas',
    storeSrc.includes('await updateContactRemote(op.payload);') && storeSrc.includes('await updatePenseeRemote(op.payload);'),
  );

  console.log('\n[§C — source] deleteContact détache toujours optimistement les pensées liées AVANT enqueue (non-régression)');
  check(
    'setPensees((prev) => prev.map(p => p.contactId === contactId ? {...p, contactId: null} : p)) toujours présent',
    storeSrc.includes("setPensees((prev) => prev.map((p) => (p.contactId === contactId ? { ...p, contactId: null } : p)));"),
  );
  const deleteContactIdx = storeSrc.indexOf('deleteContact: (contactId: string) => {');
  const enqueueDeleteContactIdx = storeSrc.indexOf('enqueueDeleteContact(prev, contactId', deleteContactIdx);
  const detachIdx = storeSrc.indexOf('contactId: null', deleteContactIdx);
  check(
    'le détachement optimiste des pensées reste bien AVANT l’enqueue du delete (ordre logique préservé)',
    deleteContactIdx >= 0 && detachIdx > deleteContactIdx && enqueueDeleteContactIdx > detachIdx,
  );

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
