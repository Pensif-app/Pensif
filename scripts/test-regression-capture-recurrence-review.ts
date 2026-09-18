// Tests de non-régression — CHANTIER RAPPELS RÉCURRENTS, incrément 3 (2026-09-18) : intégration de
// la récurrence dans la logique PURE de Capture Review (src/data/captureReview.ts). Pur, aucune
// dépendance réseau/IA/react-native. Réutilise le même style que test-regression-capture-review.ts.
//
// Usage : npx tsx scripts/test-regression-capture-recurrence-review.ts

import { CaptureResult, ExtractedPensee } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import {
  CaptureCard,
  DEFAULT_RECURRENCE_DRAFT,
  buildInitialCards,
  buildPenseeFromCard,
  isCardValid,
  needsReview,
  setRecurrenceFrequency,
  setRecurrenceOccurrenceCount,
  setRecurrenceUntilDate,
  toggleRecurrence,
  toggleRecurrenceDay,
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
const FUTURE_NOW = new Date(2020, 0, 1); // ancre fixe : toutes les dates de test (2026) sont "futures"

function cardFromReminder(reminder: ExtractedPensee['reminder']): CaptureCard {
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [makeExtracted({ texte: 'Rappel', reminder })],
    parseError: null,
  };
  return buildInitialCards(result, noMatch, NO_CONTACTS)[0];
}

// Fixtures de jours de semaine réels (2026-09-18 = vendredi, vérifié par les incréments précédents).
const A_MONDAY = '2026-09-21';
const A_TUESDAY = '2026-09-22';
const A_SATURDAY = '2026-09-19';
const A_SUNDAY = '2026-09-20';

// ====================================================================================================
console.log('\n[1] daily complet (date + heure) → sauvegardable');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: '2026-09-19',
    time: '21:40',
    heardExpression: 'tous les jours à 21h40',
    confidence: 0.95,
    recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours' },
  });
  check('recurrenceDraft activé automatiquement, frequency=daily', card.recurrenceDraft.enabled && card.recurrenceDraft.frequency === 'daily');
  check('needsReview = false (tout est complet)', !needsReview(card));
  check('sauvegardable', isCardValid(card, FUTURE_NOW));
}

console.log('\n[2] daily SANS date → needsReview + non sauvegardable (règle conservée, jamais perdue)');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: null,
    time: '21:40',
    heardExpression: 'tous les jours à 21h40',
    confidence: 0.95,
    recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours' },
  });
  check('recurrence conservée (toujours daily), jamais désactivée par l’absence de date', card.recurrenceDraft.enabled && card.recurrenceDraft.frequency === 'daily');
  check('needsReview = true', needsReview(card));
  check('NON sauvegardable', !isCardValid(card, FUTURE_NOW));
}

console.log('\n[3] daily SANS heure → needsReview + non sauvegardable');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: '2026-09-19',
    time: null,
    heardExpression: 'tous les jours',
    confidence: 0.95,
    recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours' },
  });
  check('recurrence conservée (toujours daily)', card.recurrenceDraft.frequency === 'daily');
  check('needsReview = true', needsReview(card));
  check('NON sauvegardable', !isCardValid(card, FUTURE_NOW));
}

console.log('\n[4] daily × 5 occurrences → règle conservée jusque dans la Pensee construite');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: '2026-09-19',
    time: '21:40',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null, heardExpression: 'tous les jours pendant 5 jours' },
  });
  check('occurrenceCount préremplie (5)', card.recurrenceDraft.occurrenceCount === 5);
  check('sauvegardable', isCardValid(card, FUTURE_NOW));
  const pensee = buildPenseeFromCard(card);
  check('reminderRecurrence.occurrenceCount = 5 dans la Pensee construite', pensee.reminderRecurrence?.occurrenceCount === 5);
}

console.log('\n[5] daily jusqu’à une date → règle conservée');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: '2026-09-19',
    time: '21:40',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: '2026-09-25', heardExpression: 'tous les jours jusqu’au 25 septembre' },
  });
  check('untilDate préremplie', card.recurrenceDraft.untilDate?.year === 2026 && card.recurrenceDraft.untilDate?.month === 8 && card.recurrenceDraft.untilDate?.day === 25);
  check('sauvegardable (untilDate après la première occurrence)', isCardValid(card, FUTURE_NOW));
  const pensee = buildPenseeFromCard(card);
  check('reminderRecurrence.untilDate = "2026-09-25" dans la Pensee construite', pensee.reminderRecurrence?.untilDate === '2026-09-25');
}

console.log('\n[6] lundi-vendredi → sauvegardable (première occurrence un lundi, dans le motif)');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: A_MONDAY,
    time: '08:00',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5], occurrenceCount: null, untilDate: null, heardExpression: 'du lundi au vendredi' },
  });
  check('jours préremplis [1,2,3,4,5]', JSON.stringify(card.recurrenceDraft.daysOfWeek) === JSON.stringify([1, 2, 3, 4, 5]));
  check('sauvegardable', isCardValid(card, FUTURE_NOW));
}

console.log('\n[7] chaque lundi → sauvegardable');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: A_MONDAY,
    time: '18:00',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'weekly', daysOfWeek: [1], occurrenceCount: null, untilDate: null, heardExpression: 'chaque lundi' },
  });
  check('jours préremplis [1]', JSON.stringify(card.recurrenceDraft.daysOfWeek) === JSON.stringify([1]));
  check('sauvegardable', isCardValid(card, FUTURE_NOW));
}

console.log('\n[8] week-end [0,6] → sauvegardable');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: A_SATURDAY,
    time: '10:00',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'weekly', daysOfWeek: [0, 6], occurrenceCount: null, untilDate: null, heardExpression: 'tous les samedis et dimanches' },
  });
  check('jours préremplis [0,6]', JSON.stringify(card.recurrenceDraft.daysOfWeek) === JSON.stringify([0, 6]));
  check('sauvegardable (samedi appartient au motif)', isCardValid(card, FUTURE_NOW));

  // Vérifie aussi l’autre jour du motif (dimanche).
  const cardSunday = cardFromReminder({
    hasReminder: true,
    date: A_SUNDAY,
    time: '10:00',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'weekly', daysOfWeek: [0, 6], occurrenceCount: null, untilDate: null, heardExpression: 'x' },
  });
  check('sauvegardable (dimanche appartient aussi au motif)', isCardValid(cardSunday, FUTURE_NOW));
}

console.log('\n[9] "unclear" → needsReview + non sauvegardable, aucun motif deviné');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: '2026-09-19',
    time: '21:40',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'unclear', daysOfWeek: null, occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours de la semaine' },
  });
  check('activée mais SANS fréquence choisie', card.recurrenceDraft.enabled && card.recurrenceDraft.frequency === null);
  check('heardExpression conservé verbatim', card.recurrenceDraft.heardExpression === 'tous les jours de la semaine');
  check('needsReview = true', needsReview(card));
  check('NON sauvegardable même avec date+heure présentes', !isCardValid(card, FUTURE_NOW));
}

console.log('\n[10] résolution manuelle de "unclear" → devient sauvegardable si le reste est complet');
{
  let card = cardFromReminder({
    hasReminder: true,
    date: A_MONDAY,
    time: '18:00',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'unclear', daysOfWeek: null, occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours de la semaine' },
  });
  check('non sauvegardable avant résolution', !isCardValid(card, FUTURE_NOW));

  let cards = setRecurrenceFrequency([card], card.cardId, 'weekly');
  cards = toggleRecurrenceDay(cards, card.cardId, 1); // lundi — cohérent avec A_MONDAY
  card = cards[0];
  check('frequency résolue en "weekly" par choix explicite', card.recurrenceDraft.frequency === 'weekly');
  check('jour ajouté manuellement', JSON.stringify(card.recurrenceDraft.daysOfWeek) === JSON.stringify([1]));
  check('needsReview = false désormais', !needsReview(card));
  check('sauvegardable désormais', isCardValid(card, FUTURE_NOW));
}

console.log('\n[11] première date incompatible avec le motif "weekly" → non sauvegardable');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: A_TUESDAY, // mardi — hors du motif [lundi]
    time: '18:00',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'weekly', daysOfWeek: [1], occurrenceCount: null, untilDate: null, heardExpression: 'chaque lundi' },
  });
  check('needsReview reste false (rien de "manquant", juste incohérent)', !needsReview(card));
  check('NON sauvegardable (mardi n’appartient pas au motif "chaque lundi")', !isCardValid(card, FUTURE_NOW));
}

console.log('\n[12] untilDate AVANT la première occurrence → non sauvegardable');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: '2026-09-20',
    time: '21:40',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: '2026-09-18', heardExpression: 'x' },
  });
  check('NON sauvegardable (fin avant le départ n’a pas de sens)', !isCardValid(card, FUTURE_NOW));
}

console.log('\n[13] rappel PONCTUEL historique → strictement inchangé');
{
  const card = cardFromReminder({ hasReminder: true, date: '2026-09-19', time: '18:00', heardExpression: 'demain à 18h', confidence: 0.95 });
  check('recurrenceDraft = DEFAULT (aucune récurrence)', JSON.stringify(card.recurrenceDraft) === JSON.stringify(DEFAULT_RECURRENCE_DRAFT));
  check('sauvegardable comme avant ce chantier', isCardValid(card, FUTURE_NOW));
  const pensee = buildPenseeFromCard(card);
  check('reminderAt construit normalement', pensee.reminderAt !== null);
  check('reminderRecurrence ABSENT de l’objet (pas juste null — forme strictement inchangée)', !('reminderRecurrence' in pensee));
}

console.log('\n[14] aucune récurrence détectée (recurrence undefined, compat. ancien backend) → aucune régression');
{
  const resultLegacy: CaptureResult = {
    transcript: 'x',
    pensees: [
      makeExtracted({
        texte: 'Micka aime le café',
        // Pas de champ "recurrence" du tout dans reminder — simule une réponse d’un backend antérieur
        // à cet incrément.
        reminder: { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 0.9 },
      }),
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(resultLegacy, noMatch, NO_CONTACTS);
  check('recurrenceDraft = DEFAULT, aucun crash sur un payload sans "recurrence"', JSON.stringify(card.recurrenceDraft) === JSON.stringify(DEFAULT_RECURRENCE_DRAFT));
  check('sauvegardable (simple mémo)', isCardValid(card, FUTURE_NOW));
}

console.log('\n[15] désactivation de la récurrence → retour propre au rappel ponctuel, SANS résidu de règle');
{
  const card = cardFromReminder({
    hasReminder: true,
    date: '2026-09-19',
    time: '21:40',
    heardExpression: 'x',
    confidence: 0.9,
    recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: '2026-09-25', heardExpression: 'x' },
  });
  const [disabled] = toggleRecurrence([card], card.cardId, false);
  check('recurrenceDraft revenu EXACTEMENT à DEFAULT (aucun résidu : ni jours, ni compte, ni borne, ni expression)', JSON.stringify(disabled.recurrenceDraft) === JSON.stringify(DEFAULT_RECURRENCE_DRAFT));
  check('reminderEnabled/date/time du rappel ponctuel intacts (non touchés par la désactivation)', disabled.reminderEnabled === true && disabled.reminderDate !== null && disabled.reminderTime !== null);
  check('sauvegardable comme un simple rappel ponctuel', isCardValid(disabled, FUTURE_NOW));
  const pensee = buildPenseeFromCard(disabled);
  check('reminderRecurrence absent de la Pensee construite après désactivation', !('reminderRecurrence' in pensee));
}

// ====================================================================================================
console.log('\n[actions pures] manipulations du brouillon de récurrence — préparation du futur écran');
{
  const base = cardFromReminder({ hasReminder: true, date: '2026-09-19', time: '21:40', heardExpression: 'x', confidence: 0.9 });

  console.log('  [toggleRecurrence] activation manuelle sur une carte sans récurrence détectée');
  {
    const [on] = toggleRecurrence([base], base.cardId, true);
    check('activée, fréquence encore non choisie', on.recurrenceDraft.enabled && on.recurrenceDraft.frequency === null);
  }

  console.log('  [setRecurrenceFrequency] daily → weekly vide TOUJOURS les jours choisis précédemment');
  {
    let cards = setRecurrenceFrequency([base], base.cardId, 'weekly');
    cards = toggleRecurrenceDay(cards, base.cardId, 2);
    cards = toggleRecurrenceDay(cards, base.cardId, 4);
    check('jours accumulés en weekly', JSON.stringify(cards[0].recurrenceDraft.daysOfWeek) === JSON.stringify([2, 4]));
    cards = setRecurrenceFrequency(cards, base.cardId, 'daily');
    check('passage à "daily" VIDE les jours (plus aucun sens pour daily)', cards[0].recurrenceDraft.daysOfWeek.length === 0);
  }

  console.log('  [toggleRecurrenceDay] sans effet si la fréquence n’est pas "weekly"');
  {
    const dailyCards = setRecurrenceFrequency([base], base.cardId, 'daily');
    const after = toggleRecurrenceDay(dailyCards, base.cardId, 3);
    check('aucun changement (frequency="daily", jamais de jour ajouté)', JSON.stringify(after) === JSON.stringify(dailyCards));

    const unresolvedCards = toggleRecurrence([base], base.cardId, true); // frequency reste null
    const afterUnresolved = toggleRecurrenceDay(unresolvedCards, base.cardId, 3);
    check('aucun changement non plus si frequency=null (non résolu)', JSON.stringify(afterUnresolved) === JSON.stringify(unresolvedCards));
  }

  console.log('  [toggleRecurrenceDay] décoche un jour déjà présent');
  {
    let cards = setRecurrenceFrequency([base], base.cardId, 'weekly');
    cards = toggleRecurrenceDay(cards, base.cardId, 1);
    cards = toggleRecurrenceDay(cards, base.cardId, 1); // même jour, deuxième tap → retire
    check('jour retiré au second tap', cards[0].recurrenceDraft.daysOfWeek.length === 0);
  }

  console.log('  [setRecurrenceOccurrenceCount / setRecurrenceUntilDate] définir puis retirer (null)');
  {
    let cards = setRecurrenceOccurrenceCount([base], base.cardId, 10);
    check('occurrenceCount défini', cards[0].recurrenceDraft.occurrenceCount === 10);
    cards = setRecurrenceOccurrenceCount(cards, base.cardId, null);
    check('occurrenceCount retiré (null)', cards[0].recurrenceDraft.occurrenceCount === null);

    cards = setRecurrenceUntilDate([base], base.cardId, { year: 2026, month: 8, day: 25 });
    check('untilDate défini', cards[0].recurrenceDraft.untilDate?.day === 25);
    cards = setRecurrenceUntilDate(cards, base.cardId, null);
    check('untilDate retiré (null)', cards[0].recurrenceDraft.untilDate === null);
  }

  console.log('  [toggleRecurrence] jamais d’effet sur les AUTRES cartes');
  {
    const other = cardFromReminder({ hasReminder: false, date: null, time: null, heardExpression: null, confidence: 0.9 });
    const cards = [base, { ...other, cardId: 'other' }];
    const next = toggleRecurrence(cards, base.cardId, true);
    const untouched = next.find((c) => c.cardId === 'other')!;
    check('la carte non ciblée reste rigoureusement intacte', JSON.stringify(untouched.recurrenceDraft) === JSON.stringify(DEFAULT_RECURRENCE_DRAFT));
  }
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
