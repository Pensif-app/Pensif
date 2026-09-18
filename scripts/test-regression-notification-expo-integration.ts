// Tests de non-régression — CHANTIER "Pensif — Notifications récurrentes V1, incrément 2 :
// branchement Expo" (2026-09-18). `notifications.ts` importe `expo-notifications`/`react-native` et
// n'est pas chargeable sous tsx dans cet environnement (voir test-regression-notifications.ts,
// constat déjà établi) — ce fichier couvre donc :
//   (a) la logique PURE désormais réellement exécutée en amont (buildCandidates, toExpoWeekday,
//       describeSlotRequirement), qui détermine EXACTEMENT ce que notifications.ts programmera ;
//   (b) par lecture de source, le câblage exact de notifications.ts (identifiant transmis, DATE/
//       DAILY/WEEKLY choisis par kind, ordre cancelAll → permission → budget → scheduling, chemin
//       overflow qui ne programme jamais un sous-ensemble partiel).
//
// Usage : npx tsx scripts/test-regression-notification-expo-integration.ts

import * as fs from 'fs';
import * as path from 'path';
import { Pensee, ReminderRecurrence } from '../src/data/types';
import {
  NotificationCandidate,
  OneShotCandidate,
  RecurringDailyCandidate,
  RecurringWeeklyCandidate,
  buildCandidates,
  describeSlotRequirement,
  toExpoWeekday,
  MAX_SCHEDULED_NOTIFICATIONS,
} from '../src/lib/notificationPlanning';

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
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    date: null,
    texte: 'Une pensée',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    ...overrides,
  };
}

function dailyRule(overrides: Partial<ReminderRecurrence> = {}): ReminderRecurrence {
  return { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, ...overrides };
}
function weeklyRule(daysOfWeek: number[], overrides: Partial<ReminderRecurrence> = {}): ReminderRecurrence {
  return { frequency: 'weekly', daysOfWeek, occurrenceCount: null, untilDate: null, ...overrides };
}

function isOneShot(c: NotificationCandidate): c is OneShotCandidate {
  return c.kind === 'oneShot';
}
function isRecurringDaily(c: NotificationCandidate): c is RecurringDailyCandidate {
  return c.kind === 'recurringDaily';
}
function isRecurringWeekly(c: NotificationCandidate): c is RecurringWeeklyCandidate {
  return c.kind === 'recurringWeekly';
}

const FRI_18 = (h: number, m: number) => new Date(2026, 8, 18, h, m, 0, 0); // vendredi 18 septembre 2026

// ============================================================================================
console.log('\n[§1] oneShot → deviendra un trigger DATE (candidat porte triggerAt, jamais hour/minute/weekday)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-oneshot', reminderAt: FRI_18(21, 0).toISOString() });
  const candidates = buildCandidates([], [p], now);
  const c = candidates.find((x) => x.data.kind === 'pensee' && x.data.penseeId === 'p-oneshot');
  check('candidat trouvé, kind=oneShot (→ DATE)', !!c && isOneShot(c));
  if (c && isOneShot(c)) check('triggerAt exact', c.triggerAt.getTime() === FRI_18(21, 0).getTime());
}

console.log('\n[§2] daily infinie → deviendra un trigger DAILY (hour/minute, jamais de date absolue)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-daily', reminderAt: FRI_18(21, 40).toISOString(), reminderRecurrence: dailyRule() });
  const candidates = buildCandidates([], [p], now);
  check('exactement 1 candidat recurringDaily (→ DAILY)', candidates.length === 1 && isRecurringDaily(candidates[0]));
  const c = candidates[0];
  if (isRecurringDaily(c)) check('hour=21, minute=40', c.hour === 21 && c.minute === 40);
}

console.log('\n[§3] weekly infinie (1 jour) → deviendra un trigger WEEKLY');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-weekly', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1]) });
  const candidates = buildCandidates([], [p], now);
  check('exactement 1 candidat recurringWeekly (→ WEEKLY)', candidates.length === 1 && isRecurringWeekly(candidates[0]));
}

console.log('\n[§4] conversion weekday Pensif → Expo — les 7 jours, JAMAIS supposée identique');
{
  // Doc installée (Notifications.types.d.ts, WeeklyTriggerInput) : "1 through 7, with 1 indicating
  // Sunday" → 1=dimanche..7=samedi. Convention Pensif (Date.getDay()) : 0=dimanche..6=samedi.
  const expected: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
  for (const [penseeDay, expoDay] of Object.entries(expected)) {
    check(`Pensif ${penseeDay} → Expo ${expoDay}`, toExpoWeekday(Number(penseeDay)) === expoDay);
  }
  // Jamais une identité pure (le piège que la consigne demande explicitement d'écarter).
  check('la conversion n’est PAS l’identité (0 → 0 serait faux)', toExpoWeekday(0) !== 0);
}

console.log('\n[§5] lundi-vendredi → exactement 5 candidats recurringWeekly (5 schedules côté Expo, jamais un seul trigger multi-jours)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-mf', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1, 2, 3, 4, 5]) });
  const candidates = buildCandidates([], [p], now);
  check('5 candidats, tous recurringWeekly', candidates.length === 5 && candidates.every(isRecurringWeekly));
  const expoWeekdays = (candidates as RecurringWeeklyCandidate[]).map((c) => toExpoWeekday(c.weekday)).sort((a, b) => a - b);
  check('convertis en weekdays Expo 2..6 (lundi=2 .. vendredi=6)', JSON.stringify(expoWeekdays) === JSON.stringify([2, 3, 4, 5, 6]), JSON.stringify(expoWeekdays));
}

console.log('\n[§6] daily infinie avec reminderAt (ancre) PASSÉ → trigger DAILY toujours programmé (jamais écarté comme "passé")');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-daily-old', reminderAt: new Date(2019, 0, 1, 21, 0, 0, 0).toISOString(), reminderRecurrence: dailyRule() });
  const candidates = buildCandidates([], [p], now);
  check('toujours 1 candidat recurringDaily malgré une ancre de 2019', candidates.length === 1 && isRecurringDaily(candidates[0]));
}

console.log('\n[§7] finite ×5 → exactement 5 candidats DATE (oneShot)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-finite5', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ occurrenceCount: 5 }) });
  const candidates = buildCandidates([], [p], now);
  check('5 candidats, tous oneShot (→ 5 DATE)', candidates.length === 5 && candidates.every(isOneShot));
}

console.log('\n[§8] finite partiellement passée → uniquement les occurrences restantes programmées');
{
  const now = new Date(2026, 8, 19, 22, 0, 0, 0); // après les occurrences du 18 et du 19
  const p = makePensee({ id: 'p-finite-partial', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ occurrenceCount: 5 }) });
  const candidates = buildCandidates([], [p], now);
  check('3 candidats restants (2 déjà passés jamais reprogrammés)', candidates.length === 3, `${candidates.length}`);
}

console.log('\n[§9] AUCUNE double première occurrence — jamais un oneShot ET un recurringDaily/Weekly pour la même pensée récurrente infinie');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const pDaily = makePensee({ id: 'p-single-daily', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule() });
  const pWeekly = makePensee({ id: 'p-single-weekly', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1, 3]) });
  const candidates = buildCandidates([], [pDaily, pWeekly], now);
  const forDaily = candidates.filter((c) => c.data.kind === 'pensee' && c.data.penseeId === 'p-single-daily');
  const forWeekly = candidates.filter((c) => c.data.kind === 'pensee' && c.data.penseeId === 'p-single-weekly');
  check('pensée daily : exactement 1 candidat (jamais oneShot + recurringDaily)', forDaily.length === 1 && isRecurringDaily(forDaily[0]));
  check('pensée weekly : exactement 2 candidats, tous recurringWeekly (jamais un oneShot en plus)', forWeekly.length === 2 && forWeekly.every(isRecurringWeekly));
}

console.log('\n[§10] identifiants déterministes présents sur chaque candidat (transmis tels quels à scheduleNotificationAsync, voir §source)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-id-check', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ occurrenceCount: 2 }) });
  const candidates = buildCandidates([], [p], now);
  check('2 identifiants distincts, préfixés pensee-p-id-check-occ-', candidates.length === 2 && candidates.every((c) => c.identifier.startsWith('pensee-p-id-check-occ-')));
  check('aucune collision', new Set(candidates.map((c) => c.identifier)).size === candidates.length);
}

console.log('\n[§11] payload de navigation — penseeId intact sur CHAQUE variante (oneShot, recurringDaily, recurringWeekly)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const pOnce = makePensee({ id: 'p-nav-once', reminderAt: FRI_18(21, 0).toISOString() });
  const pDaily = makePensee({ id: 'p-nav-daily', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule() });
  const pWeekly = makePensee({ id: 'p-nav-weekly', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1, 2, 3, 4, 5]) });
  const all = buildCandidates([], [pOnce, pDaily, pWeekly], now);
  check(
    'toutes les occurrences (ponctuelle, daily, les 5 weekly) portent data.kind=pensee + le bon penseeId — jamais un identifiant d’occurrence dans data',
    all.every((c) => {
      if (c.data.kind !== 'pensee') return false;
      if (c.data.penseeId === 'p-nav-once') return c.kind === 'oneShot';
      if (c.data.penseeId === 'p-nav-daily') return c.kind === 'recurringDaily';
      if (c.data.penseeId === 'p-nav-weekly') return c.kind === 'recurringWeekly';
      return false;
    }),
  );
  // "notification occurrence 1" et "notification occurrence 5" d'une même série finie résolvent la
  // MÊME pensée (même penseeId, seul le triggerAt/identifier change) — vérifié explicitement ici.
  const pFive = makePensee({ id: 'p-nav-five', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ occurrenceCount: 5 }) });
  const fiveOccurrences = buildCandidates([], [pFive], now).filter(isOneShot).sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
  check('5 occurrences produites', fiveOccurrences.length === 5);
  check(
    'occurrence 1 ET occurrence 5 portent le même penseeId (même PenseeDetail au tap)',
    fiveOccurrences[0].data.kind === 'pensee' &&
      fiveOccurrences[4].data.kind === 'pensee' &&
      fiveOccurrences[0].data.penseeId === fiveOccurrences[4].data.penseeId &&
      fiveOccurrences[0].data.penseeId === 'p-nav-five',
  );
}

console.log('\n[§12] cancel-all puis rebuild → aucun doublon LOGIQUE (mêmes identifiants reconstruits à l’identique, jamais accumulés)');
{
  // Le moteur ne connaît aucune notion d'"état précédent" (aucun ID persisté, voir audit) — deux
  // rebuilds successifs à partir des MÊMES données/instant produisent EXACTEMENT le même ensemble
  // d'identifiants, jamais une accumulation. C'est cette propriété qui rend `cancelAll → rebuild`
  // sûr contre les doublons pour un trigger récurrent natif (voir notifications.ts, incrément 2).
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-rebuild', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: weeklyRule([1, 2, 3, 4, 5]) });
  const first = buildCandidates([], [p], new Date(now)).map((c) => c.identifier).sort();
  const second = buildCandidates([], [p], new Date(now)).map((c) => c.identifier).sort();
  check('mêmes identifiants, même nombre — aucune accumulation entre deux "reschedule" successifs', JSON.stringify(first) === JSON.stringify(second));
}

// ============================================================================================
// CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 3, "Décision overflow >56" (2026-09-18) : §13 et
// §15 ci-dessous vérifiaient l'ancienne architecture "tout ou rien global" de l'incrément 2
// (describeSlotRequirement + cancel-first). Remplacées par la politique par GROUPES ATOMIQUES — voir
// test-regression-notification-capacity-groups.ts pour la couverture complète du nouveau moteur
// (selectCandidateGroupsToSchedule) ; ces deux sections ne vérifient plus ici que le CÂBLAGE source
// de notifications.ts (ordre des étapes), pas la politique de capacité elle-même.
console.log('\n[§13 — source] sélection par groupes atomiques utilisée, jamais l’ancien "tout ou rien global"');
{
  const src = readSrc('src', 'lib', 'notifications.ts');
  check('selectCandidateGroupsToSchedule appelé sur allCandidates', /const selection = selectCandidateGroupsToSchedule\(allCandidates, new Date\(\)\);/.test(src));
  check('ancien describeSlotRequirement/"tout ou rien" disparu de notifications.ts', !src.includes('describeSlotRequirement') && !src.includes('requirement.overflow'));
  check(
    'le planning programmé provient de selection.scheduledCandidates (jamais allCandidates brut) — passé tel quel au moteur d’atomicité (incrément 3)',
    /scheduleCandidateGroupsAtomically\(selection\.scheduledCandidates,/.test(src),
  );
}

console.log('\n[§14 — série finie EXTRÊMEMENT longue] pas de freeze/crash, et overflow détecté plutôt qu’une troncature silencieuse');
{
  // untilDate à 20 ans : computeNextReminderOccurrences (appelé par buildPenseeReminderCandidates)
  // est borné par MAX_DAY_SCAN (~10 ans, reminderRecurrence.ts) — donc la série RÉELLEMENT produite
  // ici est déjà > 3000 occurrences quotidiennes, bien au-delà de 56 : overflow doit être détecté.
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({
    id: 'p-very-long',
    reminderAt: FRI_18(21, 0).toISOString(),
    reminderRecurrence: dailyRule({ untilDate: '2046-09-18' }), // 20 ans
  });
  const start = Date.now();
  const candidates = buildCandidates([], [p], now);
  const elapsedMs = Date.now() - start;
  check('aucun freeze — calcul terminé rapidement (<500ms)', elapsedMs < 500, `${elapsedMs}ms`);
  check('production réelle très supérieure à 56 (pas une troncature silencieuse déguisée en petite liste)', candidates.length > MAX_SCHEDULED_NOTIFICATIONS, `${candidates.length}`);
  const requirement = describeSlotRequirement(candidates);
  check('describeSlotRequirement détecte l’overflow pour cette série', requirement.overflow === true, JSON.stringify(requirement));
}

// ============================================================================================
console.log('\n[§15 — source] permission refusée et notifications désactivées inchangées (voir test-regression-notification-capacity-groups.ts pour l’ordre planning → cancel → schedule)');
{
  const src = readSrc('src', 'lib', 'notifications.ts');
  check(
    'permission non accordée → cancelAll + return AVANT tout calcul de candidats (comportement historique préservé)',
    src.indexOf("if (status !== 'granted') {") < src.indexOf('const allCandidates = buildCandidates('),
  );
  // notificationsEnabled=false : géré par store.tsx (cancelAllReminders() au lieu de
  // rescheduleAllReminders), non touché par cet incrément — vérifié par grep plutôt que dupliqué ici.
  const storeSrc = readSrc('src', 'data', 'store.tsx');
  check(
    'store.tsx : notificationsEnabled=false → cancelAllReminders() (jamais rescheduleAllReminders), inchangé',
    /if \(!notificationsEnabled\) \{\s*cancelAllReminders\(\)\.catch/.test(storeSrc),
  );
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
