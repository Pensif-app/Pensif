// Tests de non-régression — CHANTIER "Notifications récurrentes — correctif OFF→ON" (2026-09-19).
// Couvre `resolveReminderRecurrenceForSave` (src/data/penseeReminderRecurrence.ts, utilisée par
// PenseeDetailScreen.tsx.save()), pure et sans dépendance react-native/expo. Corrige exactement le
// défaut confirmé par audit : `reminderAt=null` mais `reminderRecurrence` restait stocké, ressuscitant
// silencieusement une ancienne récurrence à la réactivation d'un rappel. Aucune UI de récurrence
// ajoutée, aucun changement au scheduler/notificationPlanning.ts/modèle Pensee.
//
// Usage : npx tsx scripts/test-regression-pensee-detail-recurrence.ts

import { Pensee, ReminderRecurrence } from '../src/data/types';
import { resolveReminderRecurrenceForSave } from '../src/data/penseeReminderRecurrence';

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
    id: 'p1',
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    ...overrides,
  };
}

const DAILY_RECURRENCE: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: 3, untilDate: null };

console.log('\n[1] récurrente + changement heure + save (rappel resté ON) → reminderRecurrence PRÉSERVÉE');
{
  const existing = makePensee({ reminderAt: '2026-09-19T23:35:00.000Z', reminderRecurrence: DAILY_RECURRENCE });
  const result = resolveReminderRecurrenceForSave(existing, true);
  check('reminderRecurrence === existing.reminderRecurrence (identique)', result === DAILY_RECURRENCE);
  check('frequency toujours "daily"', result?.frequency === 'daily');
  check('occurrenceCount toujours 3', result?.occurrenceCount === 3);
}

console.log('\n[2] récurrente + OFF + save → reminderRecurrence EFFACÉE (null), reminderAt déjà null côté appelant');
{
  const existing = makePensee({ reminderAt: '2026-09-19T23:35:00.000Z', reminderRecurrence: DAILY_RECURRENCE });
  // reminderEnabled=false reproduit exactement l'état de save() quand le Switch est désactivé —
  // c'est cet appelant qui construit par ailleurs `reminderAt=null` (voir PenseeDetailScreen.tsx),
  // cette fonction ne s'occupe que de reminderRecurrence.
  const result = resolveReminderRecurrenceForSave(existing, false);
  check('reminderRecurrence === null (explicitement effacée, jamais orpheline)', result === null);
}

console.log('\n[3] même pensée réactivée ensuite (nouvelle date, toujours aucune UI de récurrence) → reminderRecurrence reste null (rappel ponctuel uniquement)');
{
  // Représente l'état PERSISTÉ après le scénario [2] : reminderRecurrence déjà remis à null en base.
  const afterOff = makePensee({ reminderAt: null, reminderRecurrence: null });
  const result = resolveReminderRecurrenceForSave(afterOff, true);
  check('reminderRecurrence reste null (aucune résurrection silencieuse de l’ancienne récurrence)', result === null);
}

console.log('\n[cas limite] pensée sans récurrence du tout (reminderRecurrence undefined) + ON → reste null, jamais une exception');
{
  const existing = makePensee({ reminderAt: '2026-09-19T18:00:00.000Z' });
  const result = resolveReminderRecurrenceForSave(existing, true);
  check('reminderRecurrence === null (rien à préserver)', result === null);
}

console.log('\n[cas limite] création (existing=undefined) → toujours null, quel que soit reminderEnabled');
{
  check('reminderEnabled=true, existing=undefined → null', resolveReminderRecurrenceForSave(undefined, true) === null);
  check('reminderEnabled=false, existing=undefined → null', resolveReminderRecurrenceForSave(undefined, false) === null);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
