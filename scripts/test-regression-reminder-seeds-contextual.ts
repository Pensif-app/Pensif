// Tests de non-régression — CHANTIER "Pensif — Seeds temporels 2 : propositions contextuelles
// déterministes" (2026-09-18). Couvre :
//   - nextReminderRecurrenceSeedDate (reminderRecurrence.ts, incrément 2) : prochaine occurrence
//     compatible daily/weekly, frontière exacte (`now === heure du rappel` → occurrence du jour déjà
//     passée) ;
//   - reminderPickerSeedParts (captureReview.ts) : priorité stricte §6 de la consigne — extrait/
//     confirmé > récurrence explicite > eventTime (uniquement date connue + heure manquante) >
//     fallback générique "demain 9h" ;
//   - garde-fous explicites : `buildCardFromExtracted` n'injecte JAMAIS de seed, un rappel totalement
//     absent sur un événement ne déclenche AUCUNE veille automatique dans cet incrément.
//
// Tous les `now` sont des instants FIXES injectés — aucun test ne dépend de l'heure réelle de la
// machine (voir consigne §7). Modules 100% purs (reminderRecurrence.ts, captureReview.ts) —
// exécutable réellement sous `npx tsx`, aucune dépendance react-native.
//
// Usage : npx tsx scripts/test-regression-reminder-seeds-contextual.ts

import { ReminderRecurrence } from '../src/data/types';
import { nextReminderRecurrenceSeedDate } from '../src/data/reminderRecurrence';
import {
  CaptureCard,
  DEFAULT_RECURRENCE_DRAFT,
  LocalDate,
  RecurrenceDraft,
  buildInitialCards,
  isCardValid,
  recurrenceReminderPickerSeedDate,
  recurrenceStartDateLabel,
  reminderHasPendingTimeSeed,
  reminderPickerSeedParts,
} from '../src/data/captureReview';
import { CaptureResult } from '../src/data/captureTypes';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function baseCard(overrides: Partial<CaptureCard> = {}): CaptureCard {
  return {
    cardId: 'card-1',
    texte: 'texte',
    contactId: null,
    contactMatch: { kind: 'none' },
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none',
    eventHint: null,
    reminderEnabled: true,
    reminderDate: null,
    reminderTime: null,
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    confidence: 1,
    status: 'pending',
    saveError: null,
    ...overrides,
  };
}

function dailyDraft(): RecurrenceDraft {
  return { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null };
}
function weeklyDraft(daysOfWeek: number[]): RecurrenceDraft {
  return { enabled: true, frequency: 'weekly', daysOfWeek, occurrenceCount: null, untilDate: null, heardExpression: null };
}

// ============================================================================================
console.log('\n[§1 — nextReminderRecurrenceSeedDate] daily — 21:40');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };

  // vendredi 18 septembre 2026, 14:00 → 21:40 pas encore atteint → aujourd'hui
  const at14h = nextReminderRecurrenceSeedDate(rule, { hour: 21, minute: 40 }, new Date(2026, 8, 18, 14, 0, 0, 0));
  check('daily 21:40 à 14:00 → aujourd’hui (18)', at14h.year === 2026 && at14h.month === 8 && at14h.day === 18);

  // 22:00 → 21:40 déjà passé → demain
  const at22h = nextReminderRecurrenceSeedDate(rule, { hour: 21, minute: 40 }, new Date(2026, 8, 18, 22, 0, 0, 0));
  check('daily 21:40 à 22:00 → demain (19)', at22h.year === 2026 && at22h.month === 8 && at22h.day === 19);

  // exactement 21:40 → frontière : considéré déjà passé (comparaison STRICTE >, jamais >=) → demain
  const atExact = nextReminderRecurrenceSeedDate(rule, { hour: 21, minute: 40 }, new Date(2026, 8, 18, 21, 40, 0, 0));
  check(
    'daily 21:40 à EXACTEMENT 21:40 → frontière : occurrence du jour déjà passée → demain (19)',
    atExact.year === 2026 && atExact.month === 8 && atExact.day === 19,
  );
}

console.log('\n[§2 — nextReminderRecurrenceSeedDate] weekly — lundi-vendredi 08:00, samedi 10:00');
{
  // lundi 21 septembre 2026 est bien un lundi ; vendredi 25, samedi 26.
  const monToFri: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5], occurrenceCount: null, untilDate: null };
  const time0800 = { hour: 8, minute: 0 };

  const monAt07 = nextReminderRecurrenceSeedDate(monToFri, time0800, new Date(2026, 8, 21, 7, 0, 0, 0));
  check('lundi-vendredi lundi 07:00 (avant 08:00) → lundi (21)', monAt07.year === 2026 && monAt07.month === 8 && monAt07.day === 21);

  const monAt10 = nextReminderRecurrenceSeedDate(monToFri, time0800, new Date(2026, 8, 21, 10, 0, 0, 0));
  check('lundi-vendredi lundi 10:00 (après 08:00) → mardi (22)', monAt10.year === 2026 && monAt10.month === 8 && monAt10.day === 22);

  // vendredi 25 septembre 2026, 10:00 : plus aucun jour compatible cette semaine (weekend exclu) → lundi suivant (28)
  const friAt10 = nextReminderRecurrenceSeedDate(monToFri, time0800, new Date(2026, 8, 25, 10, 0, 0, 0));
  check('lundi-vendredi vendredi 10:00 → lundi suivant (28)', friAt10.year === 2026 && friAt10.month === 8 && friAt10.day === 28);

  const saturday: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [6], occurrenceCount: null, untilDate: null };
  const time1000 = { hour: 10, minute: 0 };

  // vendredi 25 septembre 2026, 10:00 → samedi suivant (26)
  const friBeforeSat = nextReminderRecurrenceSeedDate(saturday, time1000, new Date(2026, 8, 25, 10, 0, 0, 0));
  check('samedi 10:00, appelé vendredi → samedi (26)', friBeforeSat.year === 2026 && friBeforeSat.month === 8 && friBeforeSat.day === 26);

  // samedi 26 septembre 2026, 09:00 (avant 10h) → samedi lui-même (26)
  const satBefore = nextReminderRecurrenceSeedDate(saturday, time1000, new Date(2026, 8, 26, 9, 0, 0, 0));
  check('samedi 10:00, appelé samedi AVANT 10h → samedi (26) lui-même', satBefore.year === 2026 && satBefore.month === 8 && satBefore.day === 26);

  // samedi 26 septembre 2026, 11:00 (après 10h) → samedi suivant (3 octobre)
  const satAfter = nextReminderRecurrenceSeedDate(saturday, time1000, new Date(2026, 8, 26, 11, 0, 0, 0));
  check('samedi 10:00, appelé samedi APRÈS 10h → samedi suivant (3 octobre)', satAfter.year === 2026 && satAfter.month === 9 && satAfter.day === 3);

  // samedi 26 septembre 2026, EXACTEMENT 10:00 → frontière : déjà passé → samedi suivant (3 octobre)
  const satExact = nextReminderRecurrenceSeedDate(saturday, time1000, new Date(2026, 8, 26, 10, 0, 0, 0));
  check('samedi 10:00, appelé samedi à EXACTEMENT 10:00 → frontière : samedi suivant (3 octobre)', satExact.year === 2026 && satExact.month === 9 && satExact.day === 3);
}

// ============================================================================================
console.log('\n[§3 — reminderPickerSeedParts] priorité 1 : date/heure déjà extraites/confirmées ne sont JAMAIS écrasées');
{
  const now = new Date(2026, 8, 18, 14, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2026, month: 9, day: 1 },
    reminderTime: { hour: 18, minute: 0 },
    recurrenceDraft: dailyDraft(), // même avec une récurrence active, priorité 1 gagne toujours
  });
  const parts = reminderPickerSeedParts(card, now);
  check(
    'date/heure extraites conservées telles quelles malgré une récurrence active',
    parts.date.year === 2026 && parts.date.month === 9 && parts.date.day === 1 && parts.time.hour === 18 && parts.time.minute === 0,
  );
}

console.log('\n[§4 — reminderPickerSeedParts] Cas A — "tous les jours à 21h40", reminder.date=null → seed = prochaine occurrence daily, jamais "demain" générique');
{
  const now = new Date(2026, 8, 18, 22, 0, 0, 0); // 21h40 déjà passé aujourd'hui → demain (19), calculé PAR la règle daily
  const card = baseCard({ reminderTime: { hour: 21, minute: 40 }, recurrenceDraft: dailyDraft() });
  const parts = reminderPickerSeedParts(card, now);
  check('date proposée = 19 septembre (demain, calculée par la règle daily)', parts.date.year === 2026 && parts.date.month === 8 && parts.date.day === 19);
  check('heure proposée = 21:40 (déjà connue, jamais réécrite)', parts.time.hour === 21 && parts.time.minute === 40);
}

console.log('\n[§5 — reminderPickerSeedParts] Cas C — weekly "du lundi au vendredi à 08:00", appelé un vendredi 10:00 → lundi suivant (jamais un jour incompatible)');
{
  const now = new Date(2026, 8, 25, 10, 0, 0, 0); // vendredi 25 septembre 2026
  const card = baseCard({ reminderTime: { hour: 8, minute: 0 }, recurrenceDraft: weeklyDraft([1, 2, 3, 4, 5]) });
  const parts = reminderPickerSeedParts(card, now);
  check('date proposée = lundi 28 septembre (jamais samedi/dimanche)', parts.date.year === 2026 && parts.date.month === 8 && parts.date.day === 28);
  check('heure proposée = 08:00', parts.time.hour === 8 && parts.time.minute === 0);
}

console.log('\n[§5 bis — reminderPickerSeedParts] "chaque samedi à 10:00", appelé un samedi à 10:00 pile → frontière : samedi suivant');
{
  const now = new Date(2026, 8, 26, 10, 0, 0, 0); // samedi 26 septembre 2026, EXACTEMENT 10:00
  const card = baseCard({ reminderTime: { hour: 10, minute: 0 }, recurrenceDraft: weeklyDraft([6]) });
  const parts = reminderPickerSeedParts(card, now);
  check('date proposée = samedi suivant (3 octobre), jamais le samedi déjà atteint', parts.date.year === 2026 && parts.date.month === 9 && parts.date.day === 3);
}

console.log('\n[§6 — reminderPickerSeedParts] Cas D — rappel date extraite + heure manquante, eventTime connu → eventTime PROPOSÉ (jamais écrit dans la donnée extraite)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 }, // 06/03/2027
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' },
  });
  const parts = reminderPickerSeedParts(card, now);
  check('date du rappel reste STRICTEMENT 06/03/2027 (jamais recalculée depuis eventHint)', parts.date.year === 2027 && parts.date.month === 2 && parts.date.day === 6);
  check('heure PROPOSÉE = 20:00 (celle de l’événement, uniquement une proposition)', parts.time.hour === 20 && parts.time.minute === 0);
  check('card.reminderTime toujours null après l’appel (fonction PURE, aucune écriture)', card.reminderTime === null);
}

console.log('\n[§7 — reminderPickerSeedParts] reminderTime explicite → eventTime ne l’écrase JAMAIS');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 },
    reminderTime: { hour: 7, minute: 30 }, // heure de rappel déjà réellement connue
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' },
  });
  const parts = reminderPickerSeedParts(card, now);
  check('heure proposée = 07:30 (reminderTime connu), jamais 20:00 (eventTime)', parts.time.hour === 7 && parts.time.minute === 30);
}

console.log('\n[§8 — reminderPickerSeedParts] eventTime absent (eventHint.time === null) → fallback générique actuel (9h) conservé');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 },
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: null, heardExpression: null },
  });
  const parts = reminderPickerSeedParts(card, now);
  check('heure proposée = fallback générique 09:00 (aucune heure d’événement disponible)', parts.time.hour === 9 && parts.time.minute === 0);
}

console.log('\n[§9 — reminderPickerSeedParts] Cas 5 — rappel manuel totalement absent sur un événement → PAS de veille automatique, fallback générique "demain" conservé');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: null,
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' }, // événement connu, mais AUCUNE info de rappel
  });
  const parts = reminderPickerSeedParts(card, now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  check(
    'date proposée = fallback générique "demain" (JAMAIS "la veille" de l’événement, hors scope cet incrément)',
    parts.date.year === tomorrow.getFullYear() && parts.date.month === tomorrow.getMonth() && parts.date.day === tomorrow.getDate(),
  );
  check('heure proposée = fallback générique 09:00 (eventTime non substitué : la date elle-même n’est pas connue)', parts.time.hour === 9 && parts.time.minute === 0);
}

console.log('\n[§10 — reminderPickerSeedParts] weekly sans aucun jour coché → jamais résolue en seed de date, fallback générique conservé');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const unresolvedWeekly: RecurrenceDraft = { enabled: true, frequency: 'weekly', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null };
  const card = baseCard({ reminderTime: { hour: 21, minute: 40 }, recurrenceDraft: unresolvedWeekly });
  const parts = reminderPickerSeedParts(card, now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  check(
    'weekly sans aucun jour coché → jamais une règle devinée, fallback générique "demain" conservé',
    parts.date.year === tomorrow.getFullYear() && parts.date.month === tomorrow.getMonth() && parts.date.day === tomorrow.getDate(),
  );
}

// ============================================================================================
console.log('\n[§11 — buildCardFromExtracted] aucune seed contextuelle jamais injectée dans une carte construite depuis l’extraction');
{
  const result: CaptureResult = {
    transcript: 'Tous les jours à 21h40, penser à appeler Marie',
    parseError: null,
    pensees: [
      {
        texte: 'Penser à appeler Marie',
        heardContactName: 'Marie',
        confidence: 0.9,
        event: { hasDate: false, date: null, time: null, heardExpression: null },
        reminder: {
          hasReminder: true,
          date: null,
          time: '21:40',
          recurrence: { detected: true, frequency: 'daily', daysOfWeek: null, occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours' },
        },
      },
    ],
  } as unknown as CaptureResult;

  const cards = buildInitialCards(result, () => ({ kind: 'none' }), []);
  check('1 carte construite', cards.length === 1);
  check('reminderDate reste strictement null (jamais une seed de récurrence injectée par extraction)', cards[0].reminderDate === null);
  check('reminderTime reste strictement celle extraite (21:40), jamais recalculée', cards[0].reminderTime?.hour === 21 && cards[0].reminderTime?.minute === 40);
  check('recurrenceDraft.frequency = daily (reflet fidèle de l’extraction, rien d’autre)', cards[0].recurrenceDraft.frequency === 'daily');
}

// ============================================================================================
console.log('\n[§12 — CORRECTIF UX] "DATE DE DÉBUT" affiche IMMÉDIATEMENT la seed de récurrence — jamais "À définir" quand une proposition existe, jamais écrite dans card.reminderDate');
{
  // Cas réel rapporté : Capture à 18:34, "tous les jours à 19h30" → reminder.date=null. Avant ce
  // correctif, recurrenceStartDateLabel(card.reminderDate) affichait "À définir" (card.reminderDate
  // étant null) alors que la seed était déjà calculable.
  const now1834 = new Date(2026, 8, 18, 18, 34, 0, 0);
  const card = baseCard({ reminderTime: { hour: 19, minute: 30 }, recurrenceDraft: dailyDraft() });

  const displayedLabel = recurrenceStartDateLabel(card.reminderDate ?? recurrenceReminderPickerSeedDate(card, now1834));
  check('affichage = "18 septembre" (seed du jour même, 19:30 pas encore atteint à 18:34)', displayedLabel === '18 septembre');
  check('card.reminderDate reste strictement null — afficher la seed ne la confirme jamais', card.reminderDate === null);
}

console.log('\n[§13 — régression obligatoire] 18/09/2026 18:34, daily 19:30, reminderDate null → affichage 18 septembre, card.reminderDate toujours null');
{
  const now = new Date(2026, 8, 18, 18, 34, 0, 0);
  const card = baseCard({ reminderTime: { hour: 19, minute: 30 }, recurrenceDraft: dailyDraft() });
  const seed = recurrenceReminderPickerSeedDate(card, now);
  check('seed = 18 septembre 2026', seed !== null && seed.year === 2026 && seed.month === 8 && seed.day === 18);
  check('affichage = "18 septembre"', recurrenceStartDateLabel(card.reminderDate ?? seed) === '18 septembre');
  check('card.reminderDate = null (jamais confirmée par le simple affichage)', card.reminderDate === null);
}

console.log('\n[§14 — régression obligatoire] 18/09/2026 20:00, daily 19:30, reminderDate null → affichage 19 septembre (19:30 déjà passé), card.reminderDate toujours null');
{
  const now = new Date(2026, 8, 18, 20, 0, 0, 0);
  const card = baseCard({ reminderTime: { hour: 19, minute: 30 }, recurrenceDraft: dailyDraft() });
  const seed = recurrenceReminderPickerSeedDate(card, now);
  check('seed = 19 septembre 2026 (demain — 19:30 déjà atteint aujourd’hui)', seed !== null && seed.year === 2026 && seed.month === 8 && seed.day === 19);
  check('affichage = "19 septembre"', recurrenceStartDateLabel(card.reminderDate ?? seed) === '19 septembre');
  check('card.reminderDate = null (jamais confirmée par le simple affichage)', card.reminderDate === null);
}

console.log('\n[§15 — priorité] une date RÉELLEMENT confirmée prime toujours sur la seed, même après affichage répété');
{
  const now = new Date(2026, 8, 18, 18, 34, 0, 0);
  const confirmedDate: LocalDate = { year: 2026, month: 8, day: 30 };
  const card = baseCard({ reminderDate: confirmedDate, reminderTime: { hour: 19, minute: 30 }, recurrenceDraft: dailyDraft() });
  const displayed = card.reminderDate ?? recurrenceReminderPickerSeedDate(card, now);
  check('affichage = la date CONFIRMÉE (30 septembre), jamais la seed (18/19 septembre)', displayed !== null && displayed.year === 2026 && displayed.month === 8 && displayed.day === 30);
}

console.log('\n[§16 — "À définir" reste affiché] récurrence non résolue → aucune seed calculable, label inchangé');
{
  const now = new Date(2026, 8, 18, 18, 34, 0, 0);
  const unresolvedWeekly: RecurrenceDraft = { enabled: true, frequency: 'weekly', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null };
  const card = baseCard({ reminderTime: { hour: 19, minute: 30 }, recurrenceDraft: unresolvedWeekly });
  const displayed = card.reminderDate ?? recurrenceReminderPickerSeedDate(card, now);
  check('affichage = "À définir" (aucune proposition déterministe possible)', recurrenceStartDateLabel(displayed) === 'À définir');
}

// ============================================================================================
console.log('\n[§17 — CORRECTIF UX FINALE] rappel ponctuel : date extraite (06/03/2027) + reminderTime null + eventTime 20:00 → affichage combiné proposé "06/03/2027 à 20:00"');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 }, // 06/03/2027
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' },
  });
  const parts = reminderPickerSeedParts(card, now);
  check('affichage combiné = 06/03/2027 à 20:00', parts.date.year === 2027 && parts.date.month === 2 && parts.date.day === 6 && parts.time.hour === 20 && parts.time.minute === 0);
  check('card.reminderTime reste null AVANT toute confirmation (affichage pur)', card.reminderTime === null);
  check('reminderHasPendingTimeSeed = true (seed complète valide → pas d’erreur rouge)', reminderHasPendingTimeSeed(card) === true);
  check('isCardValid = false tant que reminderTime n’est pas réellement confirmé (sauvegarde bloquée)', isCardValid({ ...card, texte: 'texte' }, now) === false);
}

console.log('\n[§18 — CORRECTIF UX FINALE] "Terminé" confirme 20:00 (simulation : reminderTime devient la seed affichée)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 },
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' },
  });
  const seed = reminderPickerSeedParts(card, now);
  // confirmReminderSeed (CaptureScreen.tsx) écrit exactement reminderPickerSeedParts(card, now) dans
  // card.reminderDate/reminderTime — simulé ici pour vérifier la valeur qui SERAIT confirmée.
  const confirmedCard = { ...card, reminderDate: seed.date, reminderTime: seed.time };
  check('après confirmation, reminderTime = 20:00', confirmedCard.reminderTime.hour === 20 && confirmedCard.reminderTime.minute === 0);
  check('après confirmation, plus de seed en attente (reminderHasPendingTimeSeed = false)', reminderHasPendingTimeSeed(confirmedCard) === false);
  check('après confirmation, isCardValid = true (rappel désormais complet et confirmé)', isCardValid({ ...confirmedCard, texte: 'texte' }, now) === true);
}

console.log('\n[§19 — CORRECTIF UX FINALE] reminderTime explicite (18:00) + eventTime (20:00) → affiche/conserve 18:00, jamais 20:00');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 },
    reminderTime: { hour: 18, minute: 0 },
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' },
  });
  const parts = reminderPickerSeedParts(card, now);
  check('heure affichée = 18:00 (déjà connue), jamais 20:00 (eventTime)', parts.time.hour === 18 && parts.time.minute === 0);
  check('reminderHasPendingTimeSeed = false (reminderTime déjà connu, rien "en attente")', reminderHasPendingTimeSeed(card) === false);
}

console.log('\n[§20 — CORRECTIF UX FINALE] eventTime absent ET reminderTime absent → ne prétend jamais connaître une heure');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 },
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: null, heardExpression: null },
  });
  const parts = reminderPickerSeedParts(card, now);
  check('heure affichée = fallback générique 09:00 (aucune heure connue, jamais inventée depuis l’événement)', parts.time.hour === 9 && parts.time.minute === 0);
  check('reminderHasPendingTimeSeed = false (aucune proposition COMPLÈTE valide — pas d’eventTime réel)', reminderHasPendingTimeSeed(card) === false);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
