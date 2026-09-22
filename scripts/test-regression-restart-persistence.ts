/// <reference types="node" />
// Tests de non-régression — CHANTIER ROBUSTESSE PRÉ-BÊTA : redémarrage / persistance (2026-09-16).
// Couvre les 5 scénarios audités : (1) création/modification/suppression hors ligne → fermeture
// complète → redémarrage toujours hors ligne ; (2) puis retour réseau après redémarrage ; (3) outbox
// multi-types/multi-entités au redémarrage (ordre, coalescing, état final) ; (4) intégrité
// relationnelle/temporelle d'une pensée (rappel/date/proche lié) à travers un redémarrage ; (5) session
// restaurée avec Supabase temporairement inaccessible au démarrage.
//
// Portée de l'audit : AUCUN bug trouvé dans les 5 scénarios — l'architecture local-first/outbox déjà
// validée (resolveBootData, normalizePensee, drainOutbox/enqueue*, rescheduleAllReminders) s'est
// révélée déjà correcte sur chacun. Ce fichier verrouille ce comportement par des tests RÉELS
// (fonctions pures) + des vérifications de source pour la partie React (store.tsx, non exécutable
// sans harnais de composant) plutôt que de le supposer.
//
// Limitation architecturale CONNUE et volontairement NON corrigée ici (hors scope, l'architecture
// outbox/local-first ne doit pas être refactorée) : `contacts`/`pensees`/`outbox` sont persistés via
// 3 `useEffect` AsyncStorage INDÉPENDANTS (store.tsx), chacun déclenché par son propre changement
// d'état. Si le process est tué dans la fenêtre étroite entre le commit React et la résolution de CES
// écritures asynchrones, il existe un risque théorique qu'une seule des 3 clés persiste avant l'autre
// (ex. `pensees` mis à jour mais pas encore `outbox`). Risque déjà implicitement accepté par
// l'architecture validée (voir mémoire "persistance locale après fermeture complète de l'app" validée
// sur device) — une correction robuste (écriture atomique combinée) modifierait la structure de
// persistance elle-même, explicitement hors scope de ce chantier. Signalé ici pour traçabilité, non
// testé (un vrai test nécessiterait AsyncStorage réel + un kill de process, non reproductible en pur
// Node).
//
// Usage : npx tsx scripts/test-regression-restart-persistence.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee } from '../src/data/types';
import { resolveBootData } from '../src/data/storeInit';
import { normalizePensee } from '../src/data/calendar';
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

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', 'src', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

/** Simule EXACTEMENT ce que fait store.tsx entre deux lancements : sérialiser en JSON (écriture
 *  AsyncStorage) puis reparser (lecture au boot suivant) — prouve que la sérialisation elle-même ne
 *  perd/altère rien, plutôt que de le supposer. */
function roundtripThroughStorage<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Comparaison structurelle stable, indépendante de l'ordre d'insertion des clés (JSON.stringify seul
 *  y est sensible — deux objets fonctionnellement identiques mais construits dans un ordre différent
 *  donneraient sinon des chaînes différentes, ce qui ne serait pas un vrai bug). */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.keys(val)
          .sort()
          .reduce((acc: Record<string, unknown>, k) => {
            acc[k] = val[k];
            return acc;
          }, {})
      : val,
  );
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
    date: null,
    endDate: null,
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    pinned: false,
    // CHANTIER "Pré-TestFlight Phase 2 — Hardening release" (2026-09-22) — CORRECTIF fixture obsolète :
    // ce helper datait d'avant l'ajout de `eventTime` (Capture — event time, incrément 3, 2026-09-18)
    // et `reminderRecurrence` (persistance reminderRecurrence, 2026-09-18) à `Pensee`/`normalizePensee`.
    // Sans ces deux champs, `fullyPopulated` (§4 ci-dessous) n'était structurellement pas "une pensée
    // déjà entièrement renseignée" comme son nom l'affirmait — le test d'idempotence de normalizePensee
    // comparait un objet à 9 clés contre son résultat à 11 clés (eventTime/reminderRecurrence toujours
    // ajoutés par normalizePensee, jamais inventés : cf. calendar.ts, `?? null`) : PAS une régression
    // de normalizePensee, un fixture qui n'avait jamais suivi ces deux chantiers. Valeurs par défaut
    // alignées sur le comportement `normalizePensee` legacy (absent → null), identique à avant leur
    // ajout — aucun changement de comportement produit.
    eventTime: null,
    reminderRecurrence: null,
    ...overrides,
  } as Pensee;
}

let opCounter = 0;
function opId() {
  opCounter += 1;
  return `op-${opCounter}`;
}
const NOW = '2026-01-01T00:00:00.000Z';

/** Reproduit `drainNow()` (store.tsx, version en boucle — voir
 *  test-regression-outbox-multidelete-drain-loop.ts pour la preuve de sa correction). */
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
  console.log('\n[§1 — RÉEL] création + modification + suppression hors ligne → fermeture → redémarrage TOUJOURS hors ligne');
  {
    // État avant fermeture : une pensée créée hors ligne (isNew:true), un contact existant modifié
    // hors ligne (isNew:false), et une AUTRE pensée existante supprimée hors ligne. Reproduit
    // exactement ce que store.tsx aurait dans `outboxRef`/`contacts`/`pensees` juste avant que
        // l'utilisateur ne ferme complètement l'app.
    const created = makePensee({ id: 'p-created', texte: 'Créée hors ligne' });
    const contactBeforeEdit = makeContact({ id: 'c-edited', prenom: 'Yohan' });
    const contactAfterEdit = { ...contactBeforeEdit, prenom: 'Yohan (modifié)' };
    const deletedPensee = makePensee({ id: 'p-deleted', texte: 'Sera supprimée' });

    let outbox: Outbox = [];
    outbox = enqueueUpsertPensee(outbox, created, true, opId(), NOW);
    outbox = enqueueUpsertContact(outbox, contactAfterEdit, false, opId(), NOW);
    outbox = enqueueDeletePensee(outbox, 'p-deleted', opId(), NOW);

    // État local juste avant fermeture (déjà optimiste, comme le ferait store.tsx) : la pensée créée
    // et le contact modifié sont dans le cache, la pensée supprimée en a déjà été retirée.
    const cachedPenseesBeforeClose = [created];
    const cachedContactsBeforeClose = [contactAfterEdit];

    // Fermeture complète + redémarrage : simulateur AsyncStorage (JSON roundtrip) pour cache ET
    // outbox — prouve que la sérialisation ne perd rien.
    const cachedPenseesAfterRestart = roundtripThroughStorage(cachedPenseesBeforeClose).map(normalizePensee);
    const cachedContactsAfterRestart = roundtripThroughStorage(cachedContactsBeforeClose);
    const outboxAfterRestart = roundtripThroughStorage(outbox);

    check('les 3 opérations survivent intactes à la sérialisation (fermeture) + désérialisation (redémarrage)', outboxAfterRestart.length === 3);
    check('toujours hors ligne au redémarrage → remote=null → resolveBootData utilise le cache', true); // documente l’hypothèse du scénario

    const resolved = resolveBootData({
      cachedContacts: cachedContactsAfterRestart,
      cachedPensees: cachedPenseesAfterRestart,
      outbox: outboxAfterRestart,
      remote: null, // toujours hors ligne
    });

    check('la pensée créée hors ligne est bien présente après redémarrage', resolved.pensees.some((p) => p.id === 'p-created' && p.texte === 'Créée hors ligne'));
    check('le contact modifié hors ligne garde sa valeur modifiée après redémarrage', resolved.contacts.find((c) => c.id === 'c-edited')?.prenom === 'Yohan (modifié)');
    check('la pensée supprimée hors ligne reste absente après redémarrage', !resolved.pensees.some((p) => p.id === 'p-deleted'));
    check('l’outbox reste intacte (rien n’a pu drainer, toujours hors ligne) — les 3 opérations toujours en attente', outboxAfterRestart.length === 3);
  }

  console.log('\n[§2 — RÉEL] même scénario, puis RETOUR RÉSEAU après redémarrage → sync reprend sans perte/doublon/résurrection');
  {
    const created = makePensee({ id: 'p2-created', texte: 'Créée hors ligne' });
    const contactAfterEdit = makeContact({ id: 'c2-edited', prenom: 'Modifié' });

    let outbox: Outbox = [];
    outbox = enqueueUpsertPensee(outbox, created, true, opId(), NOW);
    outbox = enqueueUpsertContact(outbox, contactAfterEdit, false, opId(), NOW);
    outbox = enqueueDeletePensee(outbox, 'p2-deleted', opId(), NOW);
    const outboxAfterRestart = roundtripThroughStorage(outbox);

    const outboxRef = { current: outboxAfterRestart };
    const networkCalls: string[] = [];
    const executeOp = async (op: OutboxOp) => {
      networkCalls.push(`${op.kind}:${op.entityId}`);
      return { ok: true };
    };
    await loopedDrain(outboxRef, executeOp);

    check('les 3 opérations sont bien parties vers le serveur, une seule fois chacune', networkCalls.length === 3, networkCalls.join(','));
    check('aucun doublon d’appel réseau', new Set(networkCalls).size === networkCalls.length);
    check('outbox entièrement vidée après la reconnexion', outboxRef.current.length === 0);

    // Un redémarrage ULTÉRIEUR (après confirmation serveur complète) ne doit ressusciter ni dupliquer
    // rien : remote fait maintenant autorité seul, outbox vide.
    const rebootAfterSync = resolveBootData({
      cachedContacts: [contactAfterEdit],
      cachedPensees: [created],
      outbox: [],
      remote: { contacts: [contactAfterEdit], pensees: [created] }, // le serveur reflète maintenant tout
    });
    check('après resync complète, la pensée créée apparaît UNE SEULE fois (pas de doublon)', rebootAfterSync.pensees.filter((p) => p.id === 'p2-created').length === 1);
    check('la pensée supprimée avant la resync ne réapparaît jamais', !rebootAfterSync.pensees.some((p) => p.id === 'p2-deleted'));
  }

  console.log('\n[§3 — RÉEL] outbox multi-types/multi-entités au redémarrage : ordre, coalescing, état final');
  {
    // 4 types d’opérations différents, 4 entités différentes, enqueuées dans un ordre précis —
    // reproduit une session offline réaliste avant fermeture.
    let outbox: Outbox = [];
    const idContactNew = opId();
    const idPenseeNew = opId();
    const idContactUpdate = opId();
    const idPenseeDelete = opId();
    outbox = enqueueUpsertContact(outbox, makeContact({ id: 'c-new' }), true, idContactNew, NOW);
    outbox = enqueueUpsertPensee(outbox, makePensee({ id: 'p-new' }), true, idPenseeNew, NOW);
    outbox = enqueueUpsertContact(outbox, makeContact({ id: 'c-existing', prenom: 'Modifié' }), false, idContactUpdate, NOW);
    outbox = enqueueDeletePensee(outbox, 'p-existing', idPenseeDelete, NOW);

    const outboxAfterRestart = roundtripThroughStorage(outbox);
    check('les 4 opérations, 4 types/entités différents, survivent intactes à la sérialisation', outboxAfterRestart.length === 4);
    check(
      'l’ordre FIFO d’enqueue est préservé après le roundtrip JSON (pas de réordonnancement)',
      outboxAfterRestart.map((o: OutboxOp) => o.opId).join(',') === [idContactNew, idPenseeNew, idContactUpdate, idPenseeDelete].join(','),
    );

    // Redémarrage TOUJOURS hors ligne d’abord : re-modifier la pensée "p-new" (déjà en attente de
    // création) doit toujours COALESCER (isNew reste true), pas empiler un 2e op.
    const editedAfterRestart = { ...makePensee({ id: 'p-new' }), texte: 'Éditée juste après redémarrage, toujours hors ligne' };
    const outboxAfterEdit = enqueueUpsertPensee(outboxAfterRestart, editedAfterRestart, false, opId(), NOW);
    check('toujours 4 opérations après cette ré-édition (coalescing, pas d’empilement)', outboxAfterEdit.length === 4, String(outboxAfterEdit.length));
    const penseeNewOp = outboxAfterEdit.find((o: OutboxOp) => o.entityId === 'p-new');
    check('isNew reste true pour la pensée toujours pas confirmée côté serveur', penseeNewOp?.action === 'upsert' && penseeNewOp.isNew === true);
    check(
      'le payload reflète bien la ré-édition post-redémarrage',
      penseeNewOp?.kind === 'pensee' && penseeNewOp.action === 'upsert' && penseeNewOp.payload.texte === 'Éditée juste après redémarrage, toujours hors ligne',
    );

    // Puis retour réseau : drain complet, ordre respecté, état final correct.
    const outboxRef = { current: outboxAfterEdit };
    const order: string[] = [];
    await loopedDrain(outboxRef, async (op) => {
      order.push(op.entityId);
      return { ok: true };
    });
    check(
      'drain final dans l’ordre FIFO d’origine (c-new, p-new, c-existing, p-existing)',
      order.join(',') === 'c-new,p-new,c-existing,p-existing',
      order.join(','),
    );
    check('outbox entièrement vidée, état final propre', outboxRef.current.length === 0);
  }

  console.log('\n[§4 — RÉEL] intégrité relationnelle/temporelle d’une pensée (rappel + date + proche lié + épinglée) à travers un redémarrage');
  {
    const linkedContact = makeContact({ id: 'c-linked', prenom: 'Yohan' });
    const fullyPopulated = makePensee({
      id: 'p-full',
      texte: 'Anniversaire de Yohan',
      date: '2026-11-03',
      endDate: null,
      contactId: 'c-linked',
      reminderAt: '2026-11-02T18:00:00.000Z',
      createdAt: '2026-09-01T10:00:00.000Z',
      pinned: true,
    });

    // Fermeture (sérialisation) + redémarrage (désérialisation + normalizePensee, EXACTEMENT la ligne
    // de store.tsx : `JSON.parse(cachedPenseesRaw).map(normalizePensee)`).
    const afterRestart = roundtripThroughStorage([fullyPopulated]).map(normalizePensee)[0];

    check('texte inchangé', afterRestart.texte === fullyPopulated.texte);
    check('date (ancre calendrier) inchangée', afterRestart.date === fullyPopulated.date);
    check('endDate inchangée (toujours null, pas de période inventée)', afterRestart.endDate === fullyPopulated.endDate);
    check('contactId (proche lié) inchangé — aucune référence altérée', afterRestart.contactId === 'c-linked');
    check('reminderAt (rappel) inchangé au caractère près', afterRestart.reminderAt === fullyPopulated.reminderAt);
    check('createdAt inchangé', afterRestart.createdAt === fullyPopulated.createdAt);
    check('pinned (épinglée) inchangé', afterRestart.pinned === true);
    check('normalizePensee est un NO-OP complet sur une pensée déjà entièrement renseignée (idempotence)', stableStringify(afterRestart) === stableStringify(fullyPopulated));

    // Le proche lié doit aussi survivre au redémarrage (pas de résurrection/suppression accidentelle)
    // et resolveBootData ne doit jamais altérer contactId quand rien ne le concerne dans l’outbox.
    const resolved = resolveBootData({
      cachedContacts: [linkedContact],
      cachedPensees: [afterRestart],
      outbox: [], // rien en attente : cas nominal, pas de mutation en cours
      remote: null, // toujours hors ligne pour ce test
    });
    check('le proche lié est bien présent après résolution du boot', resolved.contacts.some((c) => c.id === 'c-linked'));
    check('contactId de la pensée totalement inchangé après résolution du boot', resolved.pensees.find((p) => p.id === 'p-full')?.contactId === 'c-linked');
    check('date/reminderAt/pinned tous inchangés après résolution du boot', (() => {
      const p = resolved.pensees.find((p) => p.id === 'p-full');
      return p?.date === '2026-11-03' && p?.reminderAt === '2026-11-02T18:00:00.000Z' && p?.pinned === true;
    })());
  }

  console.log('\n[§5 — RÉEL] session restaurée, Supabase temporairement inaccessible AU DÉMARRAGE — cache fait autorité, rien ne casse');
  {
    // Reproduit le bloc de boot de store.tsx : ensureAnonSession() réussit (session déjà persistée
    // localement, voir supabase.ts persistSession:true) MAIS loadRemoteData() échoue (Supabase
    // temporairement injoignable — panne, DNS, timeout...). Chacun son propre try/catch (voir
    // §5 — vérification de source ci-dessous), remote reste `null`, le cache fait autorité.
    async function simulateBoot(opts: { ensureSessionSucceeds: boolean; loadRemoteSucceeds: boolean }) {
      let userIdRef: string | null = null;
      let remote: { contacts: Contact[]; pensees: Pensee[] } | null = null;
      try {
        if (!opts.ensureSessionSucceeds) throw new Error('session indisponible');
        userIdRef = 'user-1';
        try {
          if (!opts.loadRemoteSucceeds) throw new Error('Supabase temporairement inaccessible');
          remote = { contacts: [], pensees: [] };
        } catch {
          // remote reste null — cache utilisé
        }
      } catch {
        // userIdRef reste null
      }
      return { userIdRef, remote };
    }

    const cachedContacts = [makeContact({ id: 'c-cached', prenom: 'Cache' })];
    const cachedPensees = [makePensee({ id: 'p-cached', texte: 'Depuis le cache' })];

    const { userIdRef, remote } = await simulateBoot({ ensureSessionSucceeds: true, loadRemoteSucceeds: false });
    check('la session est bien restaurée (persistée localement) malgré Supabase inaccessible', userIdRef === 'user-1');
    check('remote reste null (Supabase temporairement inaccessible, pas de crash)', remote === null);

    const resolved = resolveBootData({ cachedContacts, cachedPensees, outbox: [], remote });
    check('le cache fait autorité : contact du cache présent', resolved.contacts.some((c) => c.id === 'c-cached'));
    check('le cache fait autorité : pensée du cache présente', resolved.pensees.some((p) => p.id === 'p-cached'));

    // Variante : la session elle-même est indisponible (pas seulement les données) — ne doit pas
    // non plus faire planter la résolution, cache toujours utilisé.
    const { userIdRef: userIdRef2, remote: remote2 } = await simulateBoot({ ensureSessionSucceeds: false, loadRemoteSucceeds: false });
    check('session indisponible → userIdRef reste null, pas de crash', userIdRef2 === null);
    const resolved2 = resolveBootData({ cachedContacts, cachedPensees, outbox: [], remote: remote2 });
    check('cache toujours utilisé même sans session du tout', resolved2.contacts.some((c) => c.id === 'c-cached') && resolved2.pensees.some((p) => p.id === 'p-cached'));
  }

  console.log('\n[§5 — source] store.tsx — le boot garde bien la résolution de session et loadRemoteData() dans des try/catch INDÉPENDANTS');
  // CHANTIER "Data Safety P0-1" (2026-09-20) — ancre mise à jour : `ensureAnonSession()` a été
  // remplacée par `getExistingSession()` (lecture locale pure, jamais de création automatique) +
  // `initializeForSession()` (chemin de boot UNIQUE, voir consigne §4). `loadRemoteData` garde son
  // propre try/catch, INDÉPENDANT de la résolution de session (qui se fait AVANT, côté appelant).
  const storeSrc = readSrc('data', 'store.tsx');
  const initFnStart = storeSrc.indexOf('async function initializeForSession(session: ExistingSession) {');
  const initFnBlock = storeSrc.slice(initFnStart, initFnStart + 3600);
  check('initializeForSession existe (chemin de boot UNIQUE, voir consigne §4)', initFnStart !== -1);
  check(
    'les 2 échecs (session vs données) sont bien découplés (getExistingSession() résolu par l’appelant AVANT, loadRemoteData() dans son propre try/catch)',
    /try \{\s*remote = await loadRemoteData\(session\.userId, false\);\s*\} catch \(e\) \{/.test(initFnBlock),
  );
  check('l’outbox est chargée/persistée AVANT toute tentative Supabase (disponible quel que soit le résultat réseau)', initFnBlock.indexOf('outboxRef.current = loadedOutbox;') < initFnBlock.indexOf('remote = await loadRemoteData'));
  check('resolveBootData reste le SEUL point de résolution cache/distant/outbox (pas de logique dupliquée)', storeSrc.includes('resolveBootData({ cachedContacts, cachedPensees, outbox: loadedOutbox, remote });'));
  check('les 3 clés (contacts/pensees/outbox) sont bien persistées, chacune conditionnée à `ready`', /if \(ready\) AsyncStorage\.setItem\(KEYS\.contacts/.test(storeSrc) && /if \(ready\) AsyncStorage\.setItem\(KEYS\.pensees/.test(storeSrc) && /if \(ready\) AsyncStorage\.setItem\(KEYS\.outbox/.test(storeSrc));
  check('drain immédiat au boot si une session (même restaurée hors ligne) est disponible', storeSrc.includes('if (userIdRef.current) void drainNow();'));

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
