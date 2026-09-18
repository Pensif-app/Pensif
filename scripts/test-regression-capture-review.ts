// Tests de non-régression — CHANTIER CAPTURE INTELLIGENTE : cartes de validation (src/data/
// captureReview.ts). Couvre le contrat event/reminder séparés, l'heure jamais inventée, le repli
// sur transcript brut, le gating de "Tout enregistrer", et l'indépendance des échecs de sauvegarde.
// Pur, sans dépendance réseau/IA. Lecture seule.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-capture-review.ts

import { CaptureResult, ExtractedPensee } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import {
  CaptureCard,
  DEFAULT_RECURRENCE_DRAFT,
  buildInitialCards,
  buildPenseeFromCard,
  canSaveAll,
  discardCard,
  isCardValid,
  markFailed,
  markSaved,
  markSaving,
  needsReview,
} from '../src/data/captureReview';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeExtracted(overrides: Partial<ExtractedPensee>): ExtractedPensee {
  return {
    texte: 'Test',
    heardContactName: null,
    event: { hasDate: false, date: null, heardExpression: null, confidence: 1 },
    reminder: { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 1 },
    confidence: 0.9,
    ...overrides,
  };
}

const noMatch = (): ContactMatchResult => ({ kind: 'none' });
const NO_CONTACTS: Contact[] = [];
const FUTURE_NOW = new Date(2020, 0, 1); // ancre fixe : toutes les dates de test (2026) sont "futures" relativement à ça

console.log('\n[event/reminder séparés — DÉCISION CAPTURE V1] Une pensée datée (event) sans rappel écrit Pensee.date, sans reminderAt');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [
      makeExtracted({
        texte: 'Le mariage de Sofia',
        event: { hasDate: true, date: '2026-09-20', heardExpression: '20 septembre', confidence: 0.9 },
      }),
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
  check('eventHint renseigné', card.eventHint?.date === '2026-09-20');
  check('reminderEnabled resté false (event ≠ reminder)', card.reminderEnabled === false);
  check('carte valide (pas de rappel à valider)', isCardValid(card, FUTURE_NOW));
  const pensee = buildPenseeFromCard(card);
  check('Pensee.date = date de l’event (DÉCISION CAPTURE V1)', pensee.date === '2026-09-20');
  check('Pensee.endDate reste null (pas de période en Capture V1)', pensee.endDate === null);
  check('Pensee.reminderAt reste null (event ≠ reminder, indépendants)', pensee.reminderAt === null);
}

console.log('\n[event sans date] event.hasDate=false → Pensee.date reste null');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [makeExtracted({ texte: 'Micka aime le café' })],
    parseError: null,
  };
  const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
  check('eventHint absent', card.eventHint === null);
  const pensee = buildPenseeFromCard(card);
  check('Pensee.date reste null', pensee.date === null);
}

console.log('\n[heure jamais inventée] reminder.hasReminder=true, date connue, time=null → carte INVALIDE, needsReview');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [
      makeExtracted({
        texte: 'Écrire à Micka',
        reminder: { hasReminder: true, date: '2026-09-19', time: null, heardExpression: 'vendredi', confidence: 0.7 },
      }),
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
  check('reminderDate renseignée', card.reminderDate !== null);
  check('reminderTime resté null (jamais d’heure par défaut inventée)', card.reminderTime === null);
  check('carte invalide tant que l’heure manque', !isCardValid(card, FUTURE_NOW));
  check('needsReview = true', needsReview(card));
}

console.log('\n[carte invalide] reminder activé mais date manquante → invalide');
{
  const card: CaptureCard = {
    cardId: 'c1',
    texte: 'x',
    contactId: null,
    contactMatch: { kind: 'none' },
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none' as const,
    eventHint: null,
    reminderEnabled: true,
    reminderDate: null,
    reminderTime: { hour: 9, minute: 0 },
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    confidence: 0.9,
    status: 'pending',
    saveError: null,
    analysisFailed: false,
  };
  check('invalide (date manquante)', !isCardValid(card, FUTURE_NOW));
}

console.log('\n[proche ambigu] "Aucun" choisi explicitement (contactId=null) → reste enregistrable, needsReview signalé');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [makeExtracted({ texte: 'x', heardContactName: 'Micka' })],
    parseError: null,
  };
  const ambiguous = (): ContactMatchResult => ({ kind: 'ambiguous', candidateContactIds: ['a', 'b'] });
  const [card] = buildInitialCards(result, ambiguous, NO_CONTACTS);
  check('contactId reste null (pas de choix automatique)', card.contactId === null);
  check('needsReview = true (ambiguïté non résolue)', needsReview(card));
  check('carte tout de même VALIDE (peut être enregistrée avec "Aucun")', isCardValid(card, FUTURE_NOW));
}

console.log('\n[repli transcript brut] parseError non nul → une seule carte, texte = transcript, rien perdu');
{
  const result: CaptureResult = { transcript: 'audio incompréhensible', pensees: [], parseError: 'invalid JSON from LLM' };
  const cards = buildInitialCards(result, noMatch, NO_CONTACTS);
  check('exactement une carte', cards.length === 1);
  check('texte = transcript brut', cards[0].texte === 'audio incompréhensible');
  // CHANTIER "Capture robustness — filet de sécurité" (2026-09-18) : cette carte de repli est
  // désormais `analysisFailed: true` — plus jamais considérée "valide" comme un simple mémo
  // silencieusement enregistrable (voir isCardValid, gardée explicitement pour ce cas ; couverture
  // dédiée dans scripts/test-regression-capture-analysis-failed.ts).
  check('analysisFailed = true (nouveau garde-fou)', cards[0].analysisFailed === true);
  check('carte désormais INVALIDE tant qu’elle n’a pas été réanalysée avec succès', !isCardValid(cards[0], FUTURE_NOW));
}

console.log('\n["Tout enregistrer"] activé seulement si toutes les cartes pending sont valides');
{
  const valid: CaptureCard = {
    cardId: 'v',
    texte: 'ok',
    contactId: null,
    contactMatch: { kind: 'none' },
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none' as const,
    eventHint: null,
    reminderEnabled: false,
    reminderDate: null,
    reminderTime: null,
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    confidence: 0.9,
    status: 'pending',
    saveError: null,
    analysisFailed: false,
  };
  const invalid: CaptureCard = { ...valid, cardId: 'i', reminderEnabled: true, reminderDate: null, reminderTime: null };
  check('désactivé si une carte pending est invalide', !canSaveAll([valid, invalid], FUTURE_NOW));
  check('activé si toutes les cartes pending sont valides', canSaveAll([valid, { ...valid, cardId: 'v2' }], FUTURE_NOW));
  check('désactivé si aucune carte pending (rien à enregistrer)', !canSaveAll([], FUTURE_NOW));
  check(
    'une carte déjà "failed" ne bloque pas "Tout enregistrer" pour les autres pending valides',
    canSaveAll([valid, markFailed([invalid], 'i', 'boom')[0]], FUTURE_NOW),
  );
}

console.log('\n[échec isolé] un échec de sauvegarde ne masque pas l’erreur et ne touche aucune autre carte');
{
  let cards: CaptureCard[] = [
    {
      cardId: 'a',
      texte: 'A',
      contactId: null,
      contactMatch: { kind: 'none' },
      heardContactName: null,
      currentContactNameInText: null,
      originalContactMatchKind: 'none' as const,
      eventHint: null,
      reminderEnabled: false,
      reminderDate: null,
      reminderTime: null,
      recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
      confidence: 0.9,
      status: 'pending',
      saveError: null,
      analysisFailed: false,
    },
    {
      cardId: 'b',
      texte: 'B',
      contactId: null,
      contactMatch: { kind: 'none' },
      heardContactName: null,
      currentContactNameInText: null,
      originalContactMatchKind: 'none' as const,
      eventHint: null,
      reminderEnabled: false,
      reminderDate: null,
      reminderTime: null,
      recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
      confidence: 0.9,
      status: 'pending',
      saveError: null,
      analysisFailed: false,
    },
  ];
  cards = markSaving(cards, 'a');
  cards = markSaving(cards, 'b');
  cards = markFailed(cards, 'a', 'échec inattendu');
  cards = markSaved(cards, 'b');

  const a = cards.find((c) => c.cardId === 'a')!;
  const b = cards.find((c) => c.cardId === 'b')!;
  check('carte A reste "failed", erreur visible (pas masquée)', a.status === 'failed' && a.saveError === 'échec inattendu');
  check('carte B correctement "saved", non affectée par l’échec de A', b.status === 'saved' && b.saveError === null);
}

console.log('\n[discardCard] supprime uniquement la carte visée');
{
  const cards: CaptureCard[] = [
    { cardId: 'x', texte: 'X', contactId: null, contactMatch: { kind: 'none' }, heardContactName: null, currentContactNameInText: null, originalContactMatchKind: 'none', eventHint: null, reminderEnabled: false, reminderDate: null, reminderTime: null, recurrenceDraft: DEFAULT_RECURRENCE_DRAFT, confidence: 1, status: 'pending', saveError: null, analysisFailed: false },
    { cardId: 'y', texte: 'Y', contactId: null, contactMatch: { kind: 'none' }, heardContactName: null, currentContactNameInText: null, originalContactMatchKind: 'none', eventHint: null, reminderEnabled: false, reminderDate: null, reminderTime: null, recurrenceDraft: DEFAULT_RECURRENCE_DRAFT, confidence: 1, status: 'pending', saveError: null, analysisFailed: false },
  ];
  const next = discardCard(cards, 'x');
  check('carte x retirée', !next.some((c) => c.cardId === 'x'));
  check('carte y conservée', next.some((c) => c.cardId === 'y'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
