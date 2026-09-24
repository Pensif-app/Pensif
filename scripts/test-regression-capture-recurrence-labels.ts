// Tests de non-régression — CHANTIER RAPPELS RÉCURRENTS, UX incrément 4 (2026-09-18) : formatage
// d'affichage pur (recurrence*Label, captureReview.ts) et le cas needsReview ajouté pour "weekly
// choisi mais aucun jour encore coché". Pur, aucune dépendance react-native (ces fonctions ne
// dépendent que de captureReview.ts/calendar.ts, jamais du composant CaptureScreen.tsx lui-même —
// voir consigne "ne pas créer de nouvelle logique métier dans les composants").
//
// Usage : npx tsx scripts/test-regression-capture-recurrence-labels.ts

import { CaptureResult, ExtractedPensee } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import {
  RecurrenceDraft,
  buildInitialCards,
  isCardValid,
  needsReview,
  recurrenceDateLabel,
  recurrenceEndLabel,
  recurrenceFrequencyLabel,
  recurrenceStartDateLabel,
  recurrenceTimeLabel,
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

function draft(overrides: Partial<RecurrenceDraft>): RecurrenceDraft {
  return { enabled: true, frequency: null, daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null, ...overrides };
}

console.log('\n[recurrenceFrequencyLabel]');
check('daily → "Tous les jours"', recurrenceFrequencyLabel(draft({ frequency: 'daily' })) === 'Tous les jours');
check('weekly [1,2,3,4,5] → "Lun, Mar, Mer, Jeu, Ven" (ordre FR lundi→vendredi)', recurrenceFrequencyLabel(draft({ frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] })) === 'Lun, Mar, Mer, Jeu, Ven');
check('weekly [0,6] → "Sam, Dim" (ordre FR — jamais l’ordre interne [0,6])', recurrenceFrequencyLabel(draft({ frequency: 'weekly', daysOfWeek: [0, 6] })) === 'Sam, Dim');
check('weekly [1] → "Lun"', recurrenceFrequencyLabel(draft({ frequency: 'weekly', daysOfWeek: [1] })) === 'Lun');
check('weekly SANS jour encore coché → "À préciser"', recurrenceFrequencyLabel(draft({ frequency: 'weekly', daysOfWeek: [] })) === 'À préciser');
check('frequency=null (unclear non résolu) → "À préciser"', recurrenceFrequencyLabel(draft({ frequency: null })) === 'À préciser');

console.log('\n[recurrenceEndLabel]');
check('aucune borne → null (pas de ligne "Fin" affichée)', recurrenceEndLabel(draft({})) === null);
check('occurrenceCount=1 → "Après 1 rappel" (singulier)', recurrenceEndLabel(draft({ occurrenceCount: 1 })) === 'Après 1 rappel');
check('occurrenceCount=5 → "Après 5 rappels"', recurrenceEndLabel(draft({ occurrenceCount: 5 })) === 'Après 5 rappels');
check('untilDate → "Jusqu\'au 25 septembre"', recurrenceEndLabel(draft({ untilDate: { year: 2026, month: 8, day: 25 } })) === "Jusqu'au 25 septembre");
check('occurrenceCount prévaut si (anormalement) les deux étaient présents', recurrenceEndLabel(draft({ occurrenceCount: 3, untilDate: { year: 2026, month: 8, day: 25 } })) === 'Après 3 rappels');

console.log('\n[recurrenceStartDateLabel / recurrenceTimeLabel / recurrenceDateLabel]');
check('date manquante → "À définir"', recurrenceStartDateLabel(null) === 'À définir');
check('date présente → "18 septembre" (mois en toutes lettres)', recurrenceStartDateLabel({ year: 2026, month: 8, day: 18 }) === '18 septembre');
check('recurrenceDateLabel réutilisé identiquement', recurrenceDateLabel({ year: 2026, month: 8, day: 18 }) === '18 septembre');
check('heure manquante → "À définir"', recurrenceTimeLabel(null) === 'À définir');
check('heure présente → "21:40"', recurrenceTimeLabel({ hour: 21, minute: 40 }) === '21:40');
check('heure avec minutes/heures à un chiffre → "08:05"', recurrenceTimeLabel({ hour: 8, minute: 5 }) === '08:05');

console.log('\n[cas critique EXACT de la consigne] "tous les jours à 21h40" → Date de début "À définir", Heure "21:40", Répétition "Tous les jours"');
{
  const d = draft({ frequency: 'daily', daysOfWeek: [] });
  check('Date de début = "À définir"', recurrenceStartDateLabel(null) === 'À définir');
  check('Heure = "21:40"', recurrenceTimeLabel({ hour: 21, minute: 40 }) === '21:40');
  check('Répétition = "Tous les jours"', recurrenceFrequencyLabel(d) === 'Tous les jours');
}

console.log('\n[needsReview — nouveau cas : "weekly" choisi mais AUCUN jour encore coché]');
{
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
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [
      makeExtracted({
        reminder: {
          hasReminder: true,
          date: '2026-09-21',
          time: '18:00',
          heardExpression: 'x',
          confidence: 0.9,
          recurrence: { detected: true, frequency: 'unclear', daysOfWeek: null, occurrenceCount: null, untilDate: null, heardExpression: 'x' },
        },
      }),
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
  // Simule la résolution manuelle "Certains jours" SANS avoir encore coché de jour (setRecurrenceFrequency
  // dans captureReview.ts vide déjà systématiquement daysOfWeek au changement de fréquence).
  const resolved = { ...card, recurrenceDraft: { ...card.recurrenceDraft, frequency: 'weekly' as const, daysOfWeek: [] } };
  check('needsReview = true (aucun jour encore coché)', needsReview(resolved));
  check('NON sauvegardable', !isCardValid(resolved));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
