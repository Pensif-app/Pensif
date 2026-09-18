// Tests de non-régression — CHANTIER "Capture robustness — filet de sécurité" (2026-09-18), point 7.
// Une phrase de rappel explicite ("Rappelle-moi tous les jours à 22h55...") ne doit JAMAIS être
// présentée silencieusement comme une simple pensée sans rappel après un double échec LLM — couvre
// `CaptureCard.analysisFailed` (buildInitialCards) et `reanalyzeFailedCard` (captureReview.ts). Pur,
// sans dépendance réseau/IA. Lecture seule.
//
// Usage : npx tsx scripts/test-regression-capture-analysis-failed.ts

import { CaptureResult, ExtractedPensee } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import { buildInitialCards, canSaveAll, isCardValid, reanalyzeFailedCard } from '../src/data/captureReview';

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
    texte: 'Tester Pensif',
    heardContactName: null,
    event: { hasDate: false, date: null, heardExpression: null, confidence: 1 },
    reminder: { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 1 },
    confidence: 0.9,
    ...overrides,
  } as ExtractedPensee;
}

const noMatch = (): ContactMatchResult => ({ kind: 'none' });
const NO_CONTACTS: Contact[] = [];
const FAILING_TRANSCRIPT = 'Rappelle-moi tous les jours à 22h55 de tester Pensif pendant 3 jours.';

// ============================================================================================
console.log('\n[§1] parseError (double échec LLM) → carte analysisFailed=true, JAMAIS présentée comme un mémo normal sans rappel');
{
  const result: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'Extraction LLM indisponible : ...' };
  const cards = buildInitialCards(result, noMatch, NO_CONTACTS);
  check('exactement 1 carte', cards.length === 1);
  check('analysisFailed = true', cards[0].analysisFailed === true);
  check('texte = transcript brut (rien perdu)', cards[0].texte === FAILING_TRANSCRIPT);
  check('reminderEnabled reste false (honnête : rien n’a été extrait, jamais deviné)', cards[0].reminderEnabled === false);
}

console.log('\n[§2] pensees vide sans parseError explicite (cas défensif) → analysisFailed=true également');
{
  const result: CaptureResult = { transcript: 'x', pensees: [], parseError: null };
  const cards = buildInitialCards(result, noMatch, NO_CONTACTS);
  check('analysisFailed = true (même filet de sécurité)', cards[0].analysisFailed === true);
}

console.log('\n[§3] extraction normalement réussie → analysisFailed=false sur TOUTES les cartes (aucun faux positif)');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [makeExtracted({ texte: 'A' }), makeExtracted({ texte: 'B' })],
    parseError: null,
  };
  const cards = buildInitialCards(result, noMatch, NO_CONTACTS);
  check('2 cartes, toutes analysisFailed=false', cards.length === 2 && cards.every((c) => c.analysisFailed === false));
}

// ============================================================================================
console.log('\n[§4] reanalyzeFailedCard — nouvelle tentative ENCORE en échec → carte inchangée, reste analysisFailed');
{
  const failedResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'x' };
  const cards = buildInitialCards(failedResult, noMatch, NO_CONTACTS);
  const failedCardId = cards[0].cardId;

  const retryResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'encore un échec' };
  const next = reanalyzeFailedCard(cards, failedCardId, retryResult, noMatch, NO_CONTACTS);

  check('même nombre de cartes (aucun ajout/suppression)', next.length === 1);
  check('la carte reste analysisFailed=true', next[0].analysisFailed === true);
  check('le cardId ne change pas (même carte, pas une nouvelle)', next[0].cardId === failedCardId);
  check('le texte (transcript) reste intact', next[0].texte === FAILING_TRANSCRIPT);
}

console.log('\n[§5] reanalyzeFailedCard — succès → la carte échouée est REMPLACÉE par la carte normalement extraite, à la même position');
{
  const failedResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'x' };
  const cards = buildInitialCards(failedResult, noMatch, NO_CONTACTS);
  const failedCardId = cards[0].cardId;

  const successResult: CaptureResult = {
    transcript: FAILING_TRANSCRIPT,
    pensees: [
      makeExtracted({
        texte: 'Tester Pensif',
        reminder: {
          hasReminder: true,
          date: null,
          time: '22:55',
          heardExpression: 'tous les jours à 22h55 pendant 3 jours',
          confidence: 0.95,
          recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 3, untilDate: null, heardExpression: 'tous les jours pendant 3 jours' },
        } as ExtractedPensee['reminder'],
      }),
    ],
    parseError: null,
  };
  const next = reanalyzeFailedCard(cards, failedCardId, successResult, noMatch, NO_CONTACTS);

  check('exactement 1 carte (remplacée, pas ajoutée en plus)', next.length === 1);
  check('nouveau cardId (nouvelle carte, pas une mutation de l’ancienne)', next[0].cardId !== failedCardId);
  check('analysisFailed = false (analyse réussie cette fois)', next[0].analysisFailed === false);
  check('reminderEnabled = true', next[0].reminderEnabled === true);
  check('reminderTime = 22:55', next[0].reminderTime?.hour === 22 && next[0].reminderTime?.minute === 55);
  check('recurrenceDraft actif, daily, occurrenceCount=3', next[0].recurrenceDraft.enabled === true && next[0].recurrenceDraft.frequency === 'daily' && next[0].recurrenceDraft.occurrenceCount === 3);
  check('texte = "Tester Pensif" (extrait, plus le transcript brut)', next[0].texte === 'Tester Pensif');
}

console.log('\n[§6] reanalyzeFailedCard — succès au milieu de plusieurs cartes → remplacement à la BONNE position, les autres cartes intactes');
{
  const failedResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'x' };
  const failedCards = buildInitialCards(failedResult, noMatch, NO_CONTACTS);
  const before = { ...failedCards[0], cardId: 'before-1', texte: 'Avant' };
  const after = { ...failedCards[0], cardId: 'after-1', texte: 'Après', analysisFailed: false };
  const cards = [before, failedCards[0], after];

  const successResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [makeExtracted({ texte: 'Réanalysé avec succès' })], parseError: null };
  const next = reanalyzeFailedCard(cards, failedCards[0].cardId, successResult, noMatch, NO_CONTACTS);

  check('3 cartes au total (1 remplacée, 2 intactes)', next.length === 3);
  check('carte "before" intacte, à sa place', next[0].cardId === 'before-1' && next[0].texte === 'Avant');
  check('carte du milieu remplacée par le résultat réanalysé', next[1].texte === 'Réanalysé avec succès' && next[1].analysisFailed === false);
  check('carte "after" intacte, à sa place', next[2].cardId === 'after-1' && next[2].texte === 'Après');
}

console.log('\n[§7] reanalyzeFailedCard — cardId introuvable (carte supprimée entre-temps) → tableau inchangé, jamais d’erreur');
{
  const result: CaptureResult = { transcript: 'x', pensees: [makeExtracted({})], parseError: null };
  const cards = buildInitialCards({ transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'x' }, noMatch, NO_CONTACTS);
  const next = reanalyzeFailedCard(cards, 'un-id-qui-n-existe-pas', result, noMatch, NO_CONTACTS);
  check('tableau strictement identique (même référence de contenu)', next === cards);
}

// ============================================================================================
// CHANTIER "Capture robustness V17 — Déploiement contrôlé" (2026-09-18), point 2 : vérifications
// explicites demandées avant déploiement.

console.log('\n[§8] "Faire confiance à Pensif" ne doit JAMAIS pouvoir enregistrer silencieusement une carte analysisFailed');
{
  const failedResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'x' };
  const cards = buildInitialCards(failedResult, noMatch, NO_CONTACTS);
  check('isCardValid = false pour une carte analysisFailed', isCardValid(cards[0]) === false);
  check(
    'même avec reminderEnabled=false et texte non vide (ce qui la rendrait "valide" sans ce garde) — bloquée quand même',
    cards[0].reminderEnabled === false && cards[0].texte.trim().length > 0 && isCardValid(cards[0]) === false,
  );
  check('canSaveAll = false tant que cette carte (encore pending) est présente', canSaveAll(cards) === false);

  // Mélangée avec une autre carte parfaitement valide : "Tout enregistrer" doit rester bloqué —
  // une carte analysisFailed ne doit jamais être "couverte" par les autres cartes valides du lot.
  const validCard = { ...cards[0], cardId: 'valid-1', analysisFailed: false, texte: 'Une pensée normale' };
  check('canSaveAll = false même avec une autre carte valide dans le même lot', canSaveAll([validCard, cards[0]]) === false);
  check('canSaveAll = true une fois la carte analysisFailed retirée', canSaveAll([validCard]) === true);
}

console.log('\n[§9] séquence complète — échec initial → retry réussi → carte devient valide et enregistrable');
{
  const failedResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'x' };
  let cards = buildInitialCards(failedResult, noMatch, NO_CONTACTS);
  check('état initial : analysisFailed=true, isCardValid=false', cards[0].analysisFailed === true && isCardValid(cards[0]) === false);
  const failedCardId = cards[0].cardId;

  const successResult: CaptureResult = {
    transcript: FAILING_TRANSCRIPT,
    pensees: [
      makeExtracted({
        texte: 'Tester Pensif',
        reminder: {
          hasReminder: true,
          date: null,
          time: '22:55',
          heardExpression: 'tous les jours à 22h55 pendant 3 jours',
          confidence: 0.95,
          recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 3, untilDate: null, heardExpression: 'tous les jours pendant 3 jours' },
        } as ExtractedPensee['reminder'],
      }),
    ],
    parseError: null,
  };
  cards = reanalyzeFailedCard(cards, failedCardId, successResult, noMatch, NO_CONTACTS);
  check('après retry réussi : analysisFailed=false', cards[0].analysisFailed === false);
  check('rappel/heure/récurrence proviennent bien de la NOUVELLE extraction', cards[0].reminderEnabled === true && cards[0].reminderTime?.hour === 22 && cards[0].recurrenceDraft.occurrenceCount === 3);
  // reminderDate encore null (aucun point de départ explicite dit) → nécessite une confirmation
  // Seeds avant d'être réellement sauvegardable, comportement Seeds INCHANGÉ par ce chantier.
  check('reminderDate encore null (seed non confirmée) → pas encore valide SANS confirmation (comportement Seeds existant, pas une régression)', isCardValid(cards[0]) === false);
  cards = [{ ...cards[0], reminderDate: { year: 2026, month: 8, day: 19 } }];
  check('une fois la seed confirmée (reminderDate posée), la carte redevient normalement évaluable', isCardValid(cards[0], new Date(2026, 8, 18, 8, 0, 0, 0)) === true);
}

console.log('\n[§10] séquence complète — échec initial → retry échoue ENCORE → analysisFailed reste true, transcript conservé, jamais présenté comme valide');
{
  const failedResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'x' };
  let cards = buildInitialCards(failedResult, noMatch, NO_CONTACTS);
  const failedCardId = cards[0].cardId;

  const retryFailedResult: CaptureResult = { transcript: FAILING_TRANSCRIPT, pensees: [], parseError: 'encore un échec' };
  cards = reanalyzeFailedCard(cards, failedCardId, retryFailedResult, noMatch, NO_CONTACTS);

  check('analysisFailed reste true', cards[0].analysisFailed === true);
  check('transcript conservé intact', cards[0].texte === FAILING_TRANSCRIPT);
  check('reminderEnabled reste false — jamais présenté comme "rappel désactivé" validé', cards[0].reminderEnabled === false);
  check('isCardValid = false — aucun "faux rappel désactivé" ne peut être enregistré comme résultat valide', isCardValid(cards[0]) === false);
  check('canSaveAll = false', canSaveAll(cards) === false);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
