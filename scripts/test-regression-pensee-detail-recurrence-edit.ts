// Tests de non-régression — CHANTIER "Édition complète des récurrences dans Modifier la pensée"
// (2026-09-20). Couvre src/data/penseeReminderRecurrence.ts (brouillon PenseeRecurrenceDraft,
// transformations, validation avant sauvegarde) — pur, aucune dépendance react-native/expo/Capture.
// Complète (ne remplace pas) scripts/test-regression-pensee-detail-recurrence.ts (chantier OFF→ON,
// commit 2aabf22, toujours valable et inchangé).
//
// Usage : npx tsx scripts/test-regression-pensee-detail-recurrence-edit.ts

import { ReminderRecurrence } from '../src/data/types';
import {
  NEVER_PENSEE_RECURRENCE_DRAFT,
  PenseeRecurrenceDraft,
  buildPenseeRecurrenceDraft,
  setPenseeRecurrenceFrequency,
  setPenseeRecurrenceNever,
  setPenseeRecurrenceOccurrenceCount,
  setPenseeRecurrenceUntilDate,
  toPenseeReminderRecurrence,
  togglePenseeRecurrenceDay,
  validatePenseeRecurrenceEdit,
} from '../src/data/penseeReminderRecurrence';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Réplique EXACTEMENT la formule utilisée par PenseeDetailScreen.save() (voir son commentaire
 *  dédié) — pas une logique indépendante, juste rendue testable sans monter l'écran. */
function reminderRecurrenceForSave(draft: PenseeRecurrenceDraft, reminderEnabled: boolean): ReminderRecurrence | null {
  return reminderEnabled ? toPenseeReminderRecurrence(draft) : null;
}

const DAILY_RULE: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
const WEEKLY_135_RULE: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1, 3, 5], occurrenceCount: null, untilDate: null };

console.log('\n[1] existing daily → draft daily correct');
{
  const draft = buildPenseeRecurrenceDraft(DAILY_RULE);
  check('enabled=true', draft.enabled === true);
  check('frequency=daily', draft.frequency === 'daily');
  check('daysOfWeek=[]', deepEqual(draft.daysOfWeek, []));
  check('occurrenceCount=null', draft.occurrenceCount === null);
  check('untilDate=null', draft.untilDate === null);
}

console.log('\n[2] existing weekly [1,3,5] → draft correct');
{
  const draft = buildPenseeRecurrenceDraft(WEEKLY_135_RULE);
  check('enabled=true', draft.enabled === true);
  check('frequency=weekly', draft.frequency === 'weekly');
  check('daysOfWeek=[1,3,5]', deepEqual(draft.daysOfWeek, [1, 3, 5]));
}

console.log('\n[3] daily → weekly vide → save refusé (weekly_without_days)');
{
  const draft = setPenseeRecurrenceFrequency(buildPenseeRecurrenceDraft(DAILY_RULE), 'weekly');
  check('daysOfWeek vidé par le changement de fréquence', deepEqual(draft.daysOfWeek, []));
  const reminderAt = new Date(2026, 8, 21, 9, 0, 0); // 2026-09-21, un lundi
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, new Date(2026, 8, 20));
  check('refusé', !result.ok);
  check('reason=weekly_without_days', !result.ok && result.reason === 'weekly_without_days');
}

console.log('\n[4] weekly + jour compatible → accepté');
{
  // 2026-09-21 est un lundi (weekday=1) — cohérent avec daysOfWeek=[1,3,5].
  let draft = setPenseeRecurrenceFrequency(NEVER_PENSEE_RECURRENCE_DRAFT, 'weekly');
  draft = togglePenseeRecurrenceDay(draft, 1);
  draft = togglePenseeRecurrenceDay(draft, 3);
  draft = togglePenseeRecurrenceDay(draft, 5);
  const reminderAt = new Date(2026, 8, 21, 9, 0, 0);
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, new Date(2026, 8, 20));
  check('accepté', result.ok, JSON.stringify(result));
}

console.log('\n[5] weekly + reminderAt sur mauvais jour → refusé (anchor_not_matching_weekly)');
{
  // 2026-09-22 est un mardi — absent de daysOfWeek=[1,3,5] (lun/mer/ven).
  let draft = setPenseeRecurrenceFrequency(NEVER_PENSEE_RECURRENCE_DRAFT, 'weekly');
  draft = togglePenseeRecurrenceDay(draft, 1);
  draft = togglePenseeRecurrenceDay(draft, 3);
  draft = togglePenseeRecurrenceDay(draft, 5);
  const reminderAt = new Date(2026, 8, 22, 9, 0, 0);
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, new Date(2026, 8, 20));
  check('refusé', !result.ok);
  check('reason=anchor_not_matching_weekly', !result.ok && result.reason === 'anchor_not_matching_weekly');
}

console.log('\n[5bis] même incohérence, récurrence INFINIE (pas seulement finite) → refusée aussi (invariant produit, pas seulement scheduler)');
{
  let draft = setPenseeRecurrenceFrequency(NEVER_PENSEE_RECURRENCE_DRAFT, 'weekly');
  draft = togglePenseeRecurrenceDay(draft, 3); // mercredi uniquement
  const reminderAt = new Date(2026, 8, 21, 9, 0, 0); // lundi
  check('occurrenceCount/untilDate bien absents (série infinie)', draft.occurrenceCount === null && draft.untilDate === null);
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, new Date(2026, 8, 20));
  check('refusé malgré une série infinie (le scheduler natif tolérerait, pas l’invariant produit)', !result.ok);
  check('reason=anchor_not_matching_weekly', !result.ok && result.reason === 'anchor_not_matching_weekly');
}

console.log('\n[6] weekly → daily → daysOfWeek=[]');
{
  let draft = buildPenseeRecurrenceDraft(WEEKLY_135_RULE);
  check('avant : daysOfWeek=[1,3,5]', deepEqual(draft.daysOfWeek, [1, 3, 5]));
  draft = setPenseeRecurrenceFrequency(draft, 'daily');
  check('après : frequency=daily', draft.frequency === 'daily');
  check('après : daysOfWeek=[] (jamais un résidu weekly)', deepEqual(draft.daysOfWeek, []));
}

console.log('\n[7] recurrence → Jamais → rule=null, reminderAt indépendant (jamais touché par le draft)');
{
  const draft = NEVER_PENSEE_RECURRENCE_DRAFT;
  check('toPenseeReminderRecurrence(NEVER) === null', toPenseeReminderRecurrence(draft) === null);
  check('formule save() : reminder ON + Jamais → reminderRecurrence=null', reminderRecurrenceForSave(draft, true) === null);
  // `reminderAt` n'est PAS un champ de PenseeRecurrenceDraft — structurellement impossible pour ces
  // fonctions de le modifier, quel que soit l'appel (voir le type lui-même, aucun champ date/heure).
  check(
    'PenseeRecurrenceDraft ne porte structurellement aucun champ reminderAt/date/heure',
    !('reminderAt' in draft) && !('reminderDate' in draft),
  );
}

console.log('\n[8] Après X fois → untilDate=null');
{
  const withUntil: PenseeRecurrenceDraft = { ...buildPenseeRecurrenceDraft(DAILY_RULE), untilDate: '2026-12-31' };
  const result = setPenseeRecurrenceOccurrenceCount(withUntil, 5);
  check('occurrenceCount=5', result.occurrenceCount === 5);
  check('untilDate=null (exclusivité, même appel)', result.untilDate === null);
}

console.log("\n[9] Jusqu'au → occurrenceCount=null");
{
  const withCount: PenseeRecurrenceDraft = { ...buildPenseeRecurrenceDraft(DAILY_RULE), occurrenceCount: 5 };
  const result = setPenseeRecurrenceUntilDate(withCount, '2026-12-31');
  check('untilDate=2026-12-31', result.untilDate === '2026-12-31');
  check('occurrenceCount=null (exclusivité, même appel)', result.occurrenceCount === null);
}

console.log('\n[9bis] Fin = Jamais → efface les DEUX bornes sans toucher enabled/frequency/daysOfWeek');
{
  const draft: PenseeRecurrenceDraft = { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null };
  const result = setPenseeRecurrenceNever(draft);
  check('occurrenceCount=null', result.occurrenceCount === null);
  check('untilDate=null', result.untilDate === null);
  check('enabled/frequency inchangés (récurrence reste active)', result.enabled === true && result.frequency === 'daily');
}

console.log('\n[10] untilDate < reminderAt → refusé (until_before_anchor)');
{
  const draft: PenseeRecurrenceDraft = { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: '2026-09-15' };
  const reminderAt = new Date(2026, 8, 20, 9, 0, 0); // 2026-09-20 > untilDate
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, new Date(2026, 8, 18));
  check('refusé', !result.ok);
  check('reason=until_before_anchor', !result.ok && result.reason === 'until_before_anchor');
}

console.log('\n[10bis] untilDate déjà passée (mais >= reminderAt) → refusé (until_in_past)');
{
  const draft: PenseeRecurrenceDraft = { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: '2026-09-19' };
  const reminderAt = new Date(2026, 8, 1, 9, 0, 0); // ancien, antérieur à untilDate — pas la cause du refus
  const now = new Date(2026, 8, 20, 0, 0, 0); // untilDate (09-19) déjà dépassée par "now" (09-20)
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, now);
  check('refusé', !result.ok);
  check('reason=until_in_past', !result.ok && result.reason === 'until_in_past');
}

console.log('\n[11] ancienne série + occurrenceCount déjà entièrement consommé → refusé (finite_series_exhausted)');
{
  // Reproduit exactement le scénario A de l’audit : reminderAt ancien, occurrenceCount=3, les 3
  // occurrences logiques (ancrées sur la VRAIE première, jamais recalculées depuis "now") sont
  // toutes déjà passées.
  const draft: PenseeRecurrenceDraft = { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 3, untilDate: null };
  const reminderAt = new Date(2026, 8, 1, 9, 0, 0); // 2026-09-01
  const now = new Date(2026, 8, 20, 0, 0, 0); // 2026-09-20 — les 3 occurrences (09-01/02/03) sont passées
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, now);
  check('refusé', !result.ok);
  check('reason=finite_series_exhausted', !result.ok && result.reason === 'finite_series_exhausted');
}

console.log('\n[12] ancienne série + occurrenceCount avec occurrences futures restantes → accepté');
{
  // reminderAt=2026-09-18, occurrenceCount=5, now=2026-09-20 (scénario B de l’audit) — occurrences
  // logiques 09-18..09-22, dont au moins 09-21/09-22 restent futures.
  const draft: PenseeRecurrenceDraft = { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null };
  const reminderAt = new Date(2026, 8, 18, 9, 0, 0);
  const now = new Date(2026, 8, 20, 0, 0, 0);
  const result = validatePenseeRecurrenceEdit(draft, reminderAt, now);
  check('accepté', result.ok, JSON.stringify(result));
}

console.log('\n[13] reminder OFF → recurrence=null, quel que soit le contenu du brouillon');
{
  const draft = buildPenseeRecurrenceDraft(WEEKLY_135_RULE);
  check('reminderEnabled=false → null même avec un brouillon valide', reminderRecurrenceForSave(draft, false) === null);
}

console.log('\n[14] réouverture d’une pensée récurrente → règle fidèlement reconstruite (round-trip)');
{
  for (const rule of [DAILY_RULE, WEEKLY_135_RULE]) {
    const draft = buildPenseeRecurrenceDraft(rule);
    const rebuilt = toPenseeReminderRecurrence(draft);
    check(`round-trip fidèle pour frequency=${rule.frequency}`, deepEqual(rebuilt, rule), `rebuilt=${JSON.stringify(rebuilt)}`);
  }
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
