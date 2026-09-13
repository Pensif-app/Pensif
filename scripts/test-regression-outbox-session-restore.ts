// Tests de non-régression — BUG SYNC OFFLINE : "cold start hors ligne → retour réseau → drain
// jamais exécuté" (session obtenue au boot jetée car couplée à tort à `loadRemoteData`, qui échoue
// forcément hors ligne). Reproduit fidèlement la logique de `restoreSessionThenDrain`/boot de
// store.tsx (React Native, non chargeable sous ts-node) via une simulation pure : un état en
// mémoire (`userId`, `outbox`) et des fonctions réseau FACTICES (`ensureAnonSession`/`loadRemoteData`
// /`executeOp`) dont le succès/échec est piloté explicitement — jamais le vrai Supabase/réseau.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-outbox-session-restore.ts

import { Outbox, OutboxOp, drainOutbox, enqueueUpsertPensee } from '../src/data/outbox';
import { Pensee } from '../src/data/types';

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
    id: overrides.id ?? 'p-1',
    date: null,
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    ...overrides,
  };
}

/** Reproduit exactement le state machine de store.tsx pour ce scénario, avec réseau simulé. */
function createHarness(opts: { sessionSucceeds: () => boolean }) {
  let userId: string | null = null;
  let outbox: Outbox = [];
  let draining = false;
  let sessionRestoring = false;
  const remoteWrites: OutboxOp[] = [];

  async function ensureAnonSessionFake(): Promise<{ userId: string } | null> {
    if (!opts.sessionSucceeds()) throw new Error('network unreachable');
    return { userId: 'user-1' };
  }

  async function executeOp(op: OutboxOp): Promise<{ ok: boolean }> {
    if (!userId) return { ok: false };
    remoteWrites.push(op);
    return { ok: true };
  }

  async function drainNow() {
    if (draining) return;
    draining = true;
    try {
      if (outbox.length === 0) return;
      const result = await drainOutbox(outbox, executeOp);
      outbox = result.outbox;
    } finally {
      draining = false;
    }
  }

  // Reproduit restoreSessionThenDrain (store.tsx) telle quelle.
  async function restoreSessionThenDrain() {
    if (!userId) {
      if (sessionRestoring) return;
      sessionRestoring = true;
      try {
        const session = await ensureAnonSessionFake();
        if (session) userId = session.userId;
      } catch {
        return; // session toujours indisponible — outbox intacte, on ne drains pas
      } finally {
        sessionRestoring = false;
      }
      if (!userId) return;
    }
    await drainNow();
  }

  return {
    get userId() {
      return userId;
    },
    get outbox() {
      return outbox;
    },
    get remoteWrites() {
      return remoteWrites;
    },
    enqueue(pensee: Pensee) {
      outbox = enqueueUpsertPensee(outbox, pensee, false, `op-${pensee.id}`, '2026-01-01T00:00:00.000Z');
    },
    restoreSessionThenDrain,
  };
}

async function main() {
  console.log('\n[cold start offline → retour réseau → session rétablie → drain exécuté → outbox vidée]');
  {
    let online = false;
    const h = createHarness({ sessionSucceeds: () => online });

    // 1. Cold start hors ligne : ensureAnonSession échouerait aussi (device jamais vu de session
    //    persistée, ou refresh réseau requis) — userId reste absent, comme au premier boot réel.
    check('userId absent juste après le cold start offline', h.userId === null);

    // 2. Une pensée est modifiée hors ligne pendant que l'app est ouverte.
    h.enqueue(makePensee({ id: 'p-cold-start', texte: 'Modifiée hors ligne au cold start' }));
    check('mutation bien en attente dans l’outbox', h.outbox.some((o) => o.entityId === 'p-cold-start'));

    // 3. Le réseau revient (NetInfo passerait de false à true) — restoreSessionThenDrain déclenché.
    online = true;
    await h.restoreSessionThenDrain();

    check('la session est bien rétablie (userId renseigné)', h.userId === 'user-1');
    check('le drain a bien été exécuté (l’écriture distante a eu lieu)', h.remoteWrites.some((op) => op.entityId === 'p-cold-start'));
    check('outbox vide après succès', h.outbox.length === 0);
  }

  console.log('\n[retour réseau mais session TOUJOURS indisponible → outbox conservée intacte, aucun crash]');
  {
    const h = createHarness({ sessionSucceeds: () => false }); // ne réussit jamais
    h.enqueue(makePensee({ id: 'p-still-offline' }));
    await h.restoreSessionThenDrain();
    check('userId toujours absent', h.userId === null);
    check('outbox intacte (rien perdu)', h.outbox.some((o) => o.entityId === 'p-still-offline'));
    check('aucune écriture distante tentée', h.remoteWrites.length === 0);
  }

  console.log('\n[session déjà établie (boot en ligne classique) → restoreSessionThenDrain drain directement, sans re-tenter ensureAnonSession]');
  {
    let ensureAnonSessionCalls = 0;
    const h = createHarness({
      sessionSucceeds: () => {
        ensureAnonSessionCalls += 1;
        return true;
      },
    });
    // Simule un boot en ligne classique : la session est déjà connue AVANT tout appel à
    // restoreSessionThenDrain (comme le ferait le bloc de boot de store.tsx).
    await h.restoreSessionThenDrain(); // établit la session une première fois (équivalent du boot)
    const callsAfterBoot = ensureAnonSessionCalls;
    h.enqueue(makePensee({ id: 'p-online' }));
    await h.restoreSessionThenDrain(); // rappel (ex. AppState actif) alors que la session est déjà là
    check('ensureAnonSession n’est pas rappelée quand la session est déjà établie', ensureAnonSessionCalls === callsAfterBoot);
    check('le drain fonctionne normalement avec la session déjà en mémoire', h.outbox.length === 0 && h.remoteWrites.some((op) => op.entityId === 'p-online'));
  }

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
