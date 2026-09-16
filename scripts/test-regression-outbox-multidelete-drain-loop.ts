/// <reference types="node" />
// Tests de non-régression — CHANTIER ROBUSTESSE PRÉ-BÊTA, volet "suppressions" §3 (2026-09-16) :
// suppression multiple (plusieurs pensées/proches sélectionnés, "Supprimer" une seule fois).
//
// Bug réel trouvé par audit de `drainNow()` (store.tsx), jamais rencontré en usage mais garanti de
// se produire à chaque suppression multiple de 2+ éléments :
//   - `selectedIds.forEach(id => deletePensee(id))` appelle `enqueueAndDrain` en boucle SYNCHRONE.
//   - Le tout PREMIER appel déclenche réellement `drainNow()`, qui capture une SNAPSHOT de l'outbox
//     à cet instant précis (ne contenant QUE le 1er id — les suivants n'ont pas encore été enqueués
//     par le `forEach`, toujours en cours) puis attend le réseau (`await drainOutbox(snapshot, ...)`).
//   - Les appels `drainNow()` suivants (id 2, 3, 4, 5) arrivent PENDANT que ce premier drain est en
//     vol : `drainingRef` les bloque tous, ils ne font rien.
//   - Quand le drain du 1er id se termine, l'ancien code retirait juste cet id de `outboxRef.current`
//     et s'arrêtait — les ids 2 à 5, pourtant déjà dans `outboxRef.current` à ce moment, n'étaient
//     JAMAIS traités par CET appel. Ils restaient dans l'outbox (rien n'est perdu localement), mais
//     ne repartaient vers Supabase qu'au prochain déclencheur externe (retour au premier plan, retour
//     réseau, prochain boot) — potentiellement plusieurs minutes/heures plus tard si l'app reste au
//     premier plan sans autre mutation entre-temps.
//
// Correctif (store.tsx, `drainNow`) : boucle (`for (;;)`) qui reprend une nouvelle snapshot tant
// qu'il reste des opérations ET que le dernier passage n'a rencontré aucun échec — un seul appel
// `drainNow()` absorbe alors tout ce qui a été enqueué pendant son propre déroulement.
//
// §A/§B sont RÉELLEMENT EXÉCUTÉS contre la vraie fonction pure `drainOutbox` (outbox.ts), avec une
// orchestration locale qui reproduit fidèlement (a) l'ancien algorithme à un seul passage — pour
// PROUVER que le bug est réel et pas juste supposé — et (b) le nouvel algorithme en boucle qui
// correspond exactement à ce que fait maintenant `drainNow()`. §C vérifie par lecture de source que
// store.tsx utilise bien ce nouveau pattern.
//
// Usage : npx tsx scripts/test-regression-outbox-multidelete-drain-loop.ts

import * as fs from 'fs';
import * as path from 'path';
import { Outbox, OutboxOp, drainOutbox, enqueueDeletePensee } from '../src/data/outbox';

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

let opCounter = 0;
function opId() {
  opCounter += 1;
  return `op-${opCounter}`;
}
const NOW = '2026-01-01T00:00:00.000Z';

/** Construit l'outbox + l'executeOp qui simule la course réelle : au moment où le RÉSEAU traite le
 *  1er id sélectionné, les 4 autres viennent d'être enqueués (le `forEach` synchrone tourne pendant
 *  que ce premier appel réseau est "en vol") — exactement l'ordre d'événements réel décrit ci-dessus. */
function buildRaceScenario() {
  const outboxRef = { current: [] as Outbox };
  const ids = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'];
  const opIds = ids.map(() => opId());
  outboxRef.current = enqueueDeletePensee(outboxRef.current, ids[0], opIds[0], NOW);
  const calls: string[] = [];
  let injected = false;
  const executeOp = async (op: OutboxOp): Promise<{ ok: boolean }> => {
    calls.push(op.opId);
    if (!injected && op.opId === opIds[0]) {
      // Simule le forEach synchrone qui enqueue les 4 autres suppressions PENDANT que le 1er appel
      // réseau est en cours (avant même que cette promesse ne se résolve) — reproduit fidèlement le
      // timing réel (JS single-threaded : le `forEach` continue dès que `drainNow()` a rendu la main
      // au premier `await`, bien avant que le réseau ne réponde).
      injected = true;
      for (let i = 1; i < ids.length; i++) {
        outboxRef.current = enqueueDeletePensee(outboxRef.current, ids[i], opIds[i], NOW);
      }
    }
    return { ok: true };
  };
  return { outboxRef, opIds, calls, executeOp };
}

/** Ancien algorithme (AVANT correctif) — un seul passage, reproduit tel quel pour prouver le bug. */
async function singlePassDrain(outboxRef: { current: Outbox }, executeOp: (op: OutboxOp) => Promise<{ ok: boolean }>) {
  const snapshot = outboxRef.current;
  if (snapshot.length === 0) return;
  const result = await drainOutbox(snapshot, executeOp);
  const succeededOpIds = new Set(snapshot.filter((op) => !result.outbox.some((o) => o.opId === op.opId)).map((op) => op.opId));
  if (succeededOpIds.size === 0) return;
  outboxRef.current = outboxRef.current.filter((op) => !succeededOpIds.has(op.opId));
}

/** Nouvel algorithme (APRÈS correctif) — boucle, reproduit exactement `drainNow()` (store.tsx). */
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
  console.log('\n[§A — RÉEL] preuve du bug : l’ancien algorithme à un seul passage laisse 4 suppressions bloquées');
  {
    const { outboxRef, calls, executeOp } = buildRaceScenario();
    await singlePassDrain(outboxRef, executeOp);
    check('un seul appel réseau effectué par ce drain (p-1 uniquement)', calls.length === 1, calls.join(','));
    check(
      '4 suppressions restent bloquées dans l’outbox après ce drain, alors qu’elles étaient déjà enqueuées avant sa fin',
      outboxRef.current.length === 4,
      String(outboxRef.current.length),
    );
  }

  console.log('\n[§B — RÉEL] correctif : le nouvel algorithme en boucle absorbe les 5 suppressions en un seul drainNow()');
  {
    const { outboxRef, calls, executeOp } = buildRaceScenario();
    await loopedDrain(outboxRef, executeOp);
    check('les 5 appels réseau ont bien eu lieu (aucune suppression oubliée)', calls.length === 5, calls.join(','));
    check('outbox entièrement vidée en un seul drainNow() — plus besoin d’un déclencheur externe pour finir', outboxRef.current.length === 0);
  }

  console.log('\n[§B bis — RÉEL] un échec réel arrête quand même la boucle (pas de tempête de tentatives)');
  {
    let outbox: Outbox = [];
    const idOk = opId();
    const idFail = opId();
    const idNeverTried = opId();
    outbox = enqueueDeletePensee(outbox, 'p-ok', idOk, NOW);
    outbox = enqueueDeletePensee(outbox, 'p-fail', idFail, NOW);
    outbox = enqueueDeletePensee(outbox, 'p-never', idNeverTried, NOW);
    const outboxRef = { current: outbox };
    const calls: string[] = [];
    const executeOp = async (op: OutboxOp) => {
      calls.push(op.opId);
      return { ok: op.opId !== idFail };
    };
    await loopedDrain(outboxRef, executeOp);
    check('p-ok traité avec succès, retiré', !outboxRef.current.some((o) => o.opId === idOk));
    check('p-fail reste dans l’outbox (échec)', outboxRef.current.some((o) => o.opId === idFail));
    check('p-never jamais tenté (ordre FIFO, arrêt à la 1ère erreur) — reste dans l’outbox', outboxRef.current.some((o) => o.opId === idNeverTried));
    check('p-never n’a jamais été appelé côté réseau', !calls.includes(idNeverTried));
  }

  console.log('\n[§C — source] store.tsx : drainNow() utilise bien la boucle, pas un passage unique');
  const storeSrc = readSrc('data', 'store.tsx');
  check('boucle for (;;) présente dans drainNow', /async function drainNow\(\) \{[\s\S]*?for \(;;\) \{/.test(storeSrc));
  check('la boucle s’arrête bien sur un stoppedEarly (pas de tempête de retry)', /if \(result\.stoppedEarly\) return;/.test(storeSrc));
  check('la boucle sort proprement quand la snapshot est vide (convergence)', /if \(snapshot\.length === 0\) return;/.test(storeSrc));

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
