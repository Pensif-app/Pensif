// Tests de non-régression — CHANTIER CAPTURE INTELLIGENTE V1 (écran réel micro → écoute → analyse
// → validation → addPensee()). Couvre exactement les scénarios A-H spécifiés pour cette passe :
// event/reminder indépendants avec écriture de Pensee.date, jamais d'heure inventée, matching
// contact (préselection/needsReview/confirmation), et indépendance des échecs de sauvegarde.
// Pur, sans dépendance réseau/IA/react-native. Lecture seule sur des CaptureResult simulés.
//
// Usage : npx tsx scripts/test-regression-capture-v1-flow.ts

import { CaptureResult, ExtractedPensee } from '../src/data/captureTypes';
import { ContactMatchResult, matchContactByHeardName } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import {
  CaptureCard,
  buildInitialCards,
  buildPenseeFromCard,
  canSaveAll,
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

const FUTURE_NOW = new Date(2020, 0, 1); // ancre fixe : toutes les dates de test (2026) sont "futures"
const micka: Contact = { id: 'contact-micka', prenom: 'Micka' } as Contact;
const contacts = [micka];
const matchReal = (heard: string | null) => matchContactByHeardName(heard, contacts);

console.log('\n[A] "Micka aime le café" → 1 carte, aucun event, aucun reminder, contact fuzzy possible');
{
  const result: CaptureResult = {
    transcript: 'Mika aime le café.',
    pensees: [makeExtracted({ texte: 'Mika aime le café.', heardContactName: 'Mika' })],
    parseError: null,
  };
  const cards = buildInitialCards(result, matchReal);
  check('exactement 1 carte', cards.length === 1);
  check('aucun event', cards[0].eventHint === null);
  check('aucun reminder', cards[0].reminderEnabled === false);
  check('matching fuzzy_high_confidence → Micka', cards[0].contactMatch.kind === 'fuzzy_high_confidence');
  check('contact préselectionné', cards[0].contactId === micka.id);
}

console.log('\n[B] "Rappelle-moi demain à 18h d\'appeler Micka" → 1 carte, reminderAt correct, pas de Pensee.date');
{
  const result: CaptureResult = {
    transcript: "Rappelle-moi demain à 18h d'appeler Mika.",
    pensees: [
      makeExtracted({
        texte: 'Appeler Mika',
        heardContactName: 'Mika',
        reminder: { hasReminder: true, date: '2026-09-14', time: '18:00', heardExpression: 'demain à 18h', confidence: 0.99 },
      }),
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(result, matchReal);
  check('reminderEnabled = true', card.reminderEnabled === true);
  check('reminderDate = 2026-09-14', card.reminderDate?.year === 2026 && card.reminderDate?.month === 8 && card.reminderDate?.day === 14);
  check('reminderTime = 18:00', card.reminderTime?.hour === 18 && card.reminderTime?.minute === 0);
  check('carte valide', isCardValid(card, FUTURE_NOW));
  const pensee = buildPenseeFromCard(card);
  check('reminderAt correct', pensee.reminderAt === new Date(2026, 8, 14, 18, 0, 0, 0).toISOString());
  check('Pensee.date reste null (pas d’event)', pensee.date === null);
}

console.log('\n[C] "Micka aime les LEGO et rappelle-moi vendredi à 19h de lui écrire" → 2 cartes, rappel uniquement sur la 2e');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [
      makeExtracted({ texte: 'Mika aime les LEGO', heardContactName: 'Mika' }),
      makeExtracted({
        texte: 'Écrire à Mika',
        heardContactName: 'Mika',
        reminder: { hasReminder: true, date: '2026-09-18', time: '19:00', heardExpression: 'vendredi à 19h', confidence: 0.97 },
      }),
    ],
    parseError: null,
  };
  const cards = buildInitialCards(result, matchReal);
  check('exactement 2 cartes', cards.length === 2);
  check('carte 1 : pas de reminder', cards[0].reminderEnabled === false);
  check('carte 2 : reminder activé', cards[1].reminderEnabled === true);
  check('carte 1 : pas d’event', cards[0].eventHint === null);
  check('carte 2 : pas d’event', cards[1].eventHint === null);
}

console.log('\n[D] "Sofia a son entretien vendredi" → 1 carte, Pensee.date = vendredi, aucun reminderAt');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [
      makeExtracted({
        texte: 'Sofia a son entretien',
        heardContactName: 'Sofia',
        event: { hasDate: true, date: '2026-09-18', heardExpression: 'vendredi', confidence: 0.9 },
      }),
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(result, matchReal);
  check('reminderEnabled = false', card.reminderEnabled === false);
  const pensee = buildPenseeFromCard(card);
  check('Pensee.date = 2026-09-18 (vendredi)', pensee.date === '2026-09-18');
  check('Pensee.reminderAt reste null', pensee.reminderAt === null);
}

console.log('\n[E] reminder.hasReminder=true avec time=null → carte invalide, "Tout enregistrer" désactivé');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [
      makeExtracted({
        texte: 'Appeler Mika',
        reminder: { hasReminder: true, date: '2026-09-19', time: null, heardExpression: 'vendredi', confidence: 0.7 },
      }),
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(result, matchReal);
  check('reminderTime reste null (jamais inventée)', card.reminderTime === null);
  check('carte invalide', !isCardValid(card, FUTURE_NOW));
  check('"Tout enregistrer" désactivé', !canSaveAll([card], FUTURE_NOW));
}

console.log('\n[F] fuzzy_high_confidence → contact préselectionné, needsReview=true tant que non confirmé, false après confirmation');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [makeExtracted({ texte: 'Mika aime le café', heardContactName: 'Mika' })],
    parseError: null,
  };
  const [card] = buildInitialCards(result, matchReal);
  check('contact préselectionné (Micka)', card.contactId === micka.id);
  check('needsReview = true avant confirmation', needsReview(card));
  // Confirmation utilisateur (tap explicite sur le chip déjà présélectionné, voir CaptureScreen) :
  // le hint fuzzy n'est plus jamais revalidé après une intervention manuelle — reflété en passant
  // contactMatch à 'exact', exactement comme le fait l'écran réel.
  const confirmed: CaptureCard = { ...card, contactMatch: { kind: 'exact', contactId: micka.id } };
  check('needsReview = false après confirmation explicite', !needsReview(confirmed));
}

console.log('\n[G] ambiguous → aucun contact auto-sélectionné');
{
  const ambiguous = (): ContactMatchResult => ({ kind: 'ambiguous', candidateContactIds: ['a', 'b'] });
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [makeExtracted({ texte: 'x', heardContactName: 'Micka' })],
    parseError: null,
  };
  const [card] = buildInitialCards(result, ambiguous);
  check('contactId reste null', card.contactId === null);
  check('needsReview = true', needsReview(card));
}

console.log('\n[H] échec sauvegarde carte 2 → carte 1 reste saved, carte 2 failed, pas de rollback global');
{
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [makeExtracted({ texte: 'Carte 1' }), makeExtracted({ texte: 'Carte 2' })],
    parseError: null,
  };
  let cards = buildInitialCards(result, matchReal);
  const [c1, c2] = cards;
  cards = markSaving(cards, c1.cardId);
  cards = markSaved(cards, c1.cardId);
  cards = markSaving(cards, c2.cardId);
  cards = markFailed(cards, c2.cardId, 'échec addPensee simulé');
  const saved1 = cards.find((c) => c.cardId === c1.cardId)!;
  const failed2 = cards.find((c) => c.cardId === c2.cardId)!;
  check('carte 1 reste "saved"', saved1.status === 'saved');
  check('carte 2 "failed" avec message visible', failed2.status === 'failed' && failed2.saveError === 'échec addPensee simulé');
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
