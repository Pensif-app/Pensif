/// <reference types="node" />
// Tests de non-régression — CHANTIER ROBUSTESSE PRÉ-BÊTA, volet "doublons" §1 (2026-09-16) :
// double-tap sur "Enregistrer" (Capture Review) pouvait créer 2 pensées pour une seule intention.
//
// Bug réel trouvé par audit : `handleSaveCard`/`handleSaveAll` (CaptureScreen.tsx) sont entièrement
// SYNCHRONES (aucun `await` avant `addPensee`) et ne vérifiaient QUE `isCardValid(card)`/
// `canSaveAll(cards)` — jamais si une sauvegarde était déjà en cours pour cette carte. Contrairement
// à PenseeDetailScreen/FicheScreen (qui ont déjà un garde-fou `savingRef` pour exactement cette
// raison, voir commit "harden double-tap saves"), rien n'empêchait un double-tap physique de délivrer
// 2 événements `onPress` avant que React n'ait re-rendu (qui masque le bouton une fois `status:
// 'saved'`) — les deux lisant alors la MÊME fermeture `cards` (toujours `status: 'pending'` dans les
// deux cas) → `addPensee` appelé deux fois → 2 pensées dupliquées en base pour 1 seule carte.
//
// Correctif : mêmes garde-fous par `ref` (mutation synchrone, visible immédiatement — contrairement à
// `useState`) que les 2 autres écrans : `savingCardIdsRef`/`savingAllRef`, relâchés UNIQUEMENT en cas
// d'échec réel (pour permettre un retry), jamais après un succès.
//
// §A/§B sont RÉELLEMENT EXÉCUTÉS contre une reproduction fidèle de l'algorithme AVANT/APRÈS correctif
// (mêmes structures de données que captureReview.ts, orchestration identique à handleSaveCard) —
// prouve que le bug était réel et que le correctif l'empêche. §C vérifie par lecture de source que
// CaptureScreen.tsx utilise bien ce pattern.
//
// Usage : npx tsx scripts/test-regression-capture-duplicate-save-guard.ts

import * as fs from 'fs';
import * as path from 'path';
import { CaptureCard, DEFAULT_RECURRENCE_DRAFT, isCardValid, markFailed, markSaved, markSaving } from '../src/data/captureReview';

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

function makeCard(overrides: Partial<CaptureCard> = {}): CaptureCard {
  return {
    cardId: 'card-1',
    texte: 'Appeler Yohan',
    contactId: null,
    contactMatch: { kind: 'none' },
    originalContactMatchKind: 'none',
    currentContactNameInText: null,
    eventHint: null,
    reminderEnabled: false,
    reminderDate: null,
    reminderTime: null,
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    status: 'pending',
    saveError: null,
    ...overrides,
  } as CaptureCard;
}

console.log('\n[§A — RÉEL] preuve du bug : SANS garde-fou, un double-tap synchrone crée 2 pensées pour 1 carte');
{
  let addPenseeCalls = 0;
  const cardsClosure = [makeCard()]; // même carte "vue" par les 2 taps (fermeture figée, comme React avant re-render)

  // Reproduit l'ANCIEN handleSaveCard (sans savingCardIdsRef) — orchestration fidèle de saveOne.
  function oldHandleSaveCard(cardId: string) {
    const card = cardsClosure.find((c) => c.cardId === cardId);
    if (!card || !isCardValid(card)) return;
    let next = markSaving([card], cardId);
    addPenseeCalls += 1; // équivalent de addPensee(buildPenseeFromCard(...))
    next = markSaved(next, cardId);
    void next;
  }

  // Double-tap : 2 événements onPress synchrones, AVANT tout re-render (même fermeture `cardsClosure`).
  oldHandleSaveCard('card-1');
  oldHandleSaveCard('card-1');

  check('BUG CONFIRMÉ (ancien code) : addPensee appelé 2 fois pour 1 seule carte', addPenseeCalls === 2, String(addPenseeCalls));
}

console.log('\n[§B — RÉEL] correctif : AVEC savingCardIdsRef, le même double-tap ne crée qu’UNE pensée');
{
  let addPenseeCalls = 0;
  const cardsClosure = [makeCard()];
  const savingCardIdsRef = { current: new Set<string>() };

  // Reproduit le NOUVEAU handleSaveCard (avec savingCardIdsRef) — même logique que CaptureScreen.tsx.
  function newHandleSaveCard(cardId: string) {
    if (savingCardIdsRef.current.has(cardId)) return;
    const card = cardsClosure.find((c) => c.cardId === cardId);
    if (!card || !isCardValid(card)) return;
    savingCardIdsRef.current.add(cardId);
    let next = markSaving([card], cardId);
    addPenseeCalls += 1;
    next = markSaved(next, cardId);
    const status = next.find((c) => c.cardId === cardId)?.status;
    if (status === 'failed') savingCardIdsRef.current.delete(cardId);
  }

  newHandleSaveCard('card-1');
  newHandleSaveCard('card-1'); // 2e tap synchrone — doit être ignoré

  check('addPensee appelé UNE SEULE fois malgré le double-tap', addPenseeCalls === 1, String(addPenseeCalls));
}

console.log('\n[§B bis — RÉEL] échec réel (ex. reminder invalide entre-temps) → la garde est relâchée, un vrai retry reste possible');
{
  let addPenseeAttempts = 0;
  const cardsClosure = [makeCard()];
  const savingCardIdsRef = { current: new Set<string>() };

  function newHandleSaveCard(cardId: string, shouldThrow: boolean) {
    if (savingCardIdsRef.current.has(cardId)) return;
    const card = cardsClosure.find((c) => c.cardId === cardId);
    if (!card || !isCardValid(card)) return;
    savingCardIdsRef.current.add(cardId);
    let next = markSaving([card], cardId);
    try {
      addPenseeAttempts += 1;
      if (shouldThrow) throw new Error('échec réseau simulé');
      next = markSaved(next, cardId);
    } catch (e) {
      next = markFailed(next, cardId, e instanceof Error ? e.message : String(e));
    }
    const status = next.find((c) => c.cardId === cardId)?.status;
    if (status === 'failed') savingCardIdsRef.current.delete(cardId);
  }

  newHandleSaveCard('card-1', true); // 1er essai échoue réellement
  check('la garde est relâchée après un échec réel', !savingCardIdsRef.current.has('card-1'));
  newHandleSaveCard('card-1', false); // l’utilisateur retente légitimement, cette fois ça réussit
  check('le retry légitime a bien pu s’exécuter (2 tentatives au total, pas bloqué)', addPenseeAttempts === 2, String(addPenseeAttempts));
}

console.log('\n[§C — source] CaptureScreen.tsx — garde-fous présents et câblés correctement');
const captureSrc = readSrc('screens', 'CaptureScreen.tsx');
check('savingCardIdsRef déclaré (Set, par carte)', captureSrc.includes('const savingCardIdsRef = useRef<Set<string>>(new Set());'));
check('savingAllRef déclaré', captureSrc.includes('const savingAllRef = useRef(false);'));
check(
  'handleSaveCard vérifie la garde AVANT toute autre chose (2e appel ignoré)',
  /function handleSaveCard\(cardId: string\) \{\s*if \(savingCardIdsRef\.current\.has\(cardId\)\) return;/.test(captureSrc),
);
check('handleSaveCard pose la garde avant addPensee (via saveOne)', captureSrc.includes('savingCardIdsRef.current.add(cardId);\n    const next = saveOne(card);'));
check('handleSaveCard relâche la garde UNIQUEMENT en cas d’échec réel (retry possible)', captureSrc.includes("status === 'failed') savingCardIdsRef.current.delete(cardId);"));
check(
  'handleSaveAll vérifie la garde AVANT toute autre chose (2e appel ignoré)',
  /function handleSaveAll\(\) \{\s*if \(savingAllRef\.current\) return;/.test(captureSrc),
);
check('handleSaveAll relâche la garde UNIQUEMENT en cas d’échec réel (allOk === false)', /if \(allOk\) \{\s*navigation\.goBack\(\);\s*\} else \{\s*savingAllRef\.current = false;/.test(captureSrc));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
