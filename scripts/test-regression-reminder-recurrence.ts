// Tests de non-régression — CHANTIER RAPPELS RÉCURRENTS, incrément 1 (2026-09-18) : modèle pur
// (src/data/reminderRecurrence.ts). Exécuté RÉELLEMENT (aucune dépendance react-native/réseau).
//
// Usage : npx tsx scripts/test-regression-reminder-recurrence.ts

import { ReminderRecurrence } from '../src/data/types';
import {
  computeNextReminderOccurrences,
  normalizeReminderRecurrence,
  reminderRecurrenceMatchesDate,
} from '../src/data/reminderRecurrence';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ============================================================================================
console.log('\n[§A] normalizeReminderRecurrence — règles valides');
{
  const daily = normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: null, untilDate: null });
  check('daily minimal → ok, daysOfWeek normalisé à []', daily !== null && daily.frequency === 'daily' && daily.daysOfWeek.length === 0);

  const weekly = normalizeReminderRecurrence({ frequency: 'weekly', daysOfWeek: [5, 1, 3], occurrenceCount: null, untilDate: null });
  check(
    'weekly → daysOfWeek dédupliqué + trié croissant',
    weekly !== null && JSON.stringify(weekly.daysOfWeek) === JSON.stringify([1, 3, 5]),
  );

  const withCount = normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: 5, untilDate: null });
  check('occurrenceCount entier >=1 accepté', withCount?.occurrenceCount === 5);

  const withUntil = normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: null, untilDate: '2026-09-25' });
  check('untilDate calendaire valide accepté', withUntil?.untilDate === '2026-09-25');

  const withBoth = normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: 10, untilDate: '2026-12-31' });
  check('occurrenceCount ET untilDate peuvent coexister (décision documentée)', withBoth !== null && withBoth.occurrenceCount === 10 && withBoth.untilDate === '2026-12-31');

  const dedupWeekly = normalizeReminderRecurrence({ frequency: 'weekly', daysOfWeek: [0, 6, 0, 6], occurrenceCount: null, untilDate: null });
  check('weekly avec doublons → dédupliqué proprement', dedupWeekly !== null && JSON.stringify(dedupWeekly.daysOfWeek) === JSON.stringify([0, 6]));
}

console.log('\n[§B] normalizeReminderRecurrence — règles INVALIDES → null, jamais une correction silencieuse');
{
  check('frequency inconnue → null', normalizeReminderRecurrence({ frequency: 'monthly', occurrenceCount: null, untilDate: null }) === null);
  check('frequency absente → null', normalizeReminderRecurrence({ occurrenceCount: null, untilDate: null }) === null);
  check('weekly SANS aucun jour → null (jamais interprété comme "jamais")', normalizeReminderRecurrence({ frequency: 'weekly', daysOfWeek: [], occurrenceCount: null, untilDate: null }) === null);
  check('weekly daysOfWeek absent → null (équivalent à [])', normalizeReminderRecurrence({ frequency: 'weekly', occurrenceCount: null, untilDate: null }) === null);
  check('daysOfWeek hors bornes (7) → null', normalizeReminderRecurrence({ frequency: 'weekly', daysOfWeek: [7], occurrenceCount: null, untilDate: null }) === null);
  check('daysOfWeek négatif (-1) → null', normalizeReminderRecurrence({ frequency: 'weekly', daysOfWeek: [-1], occurrenceCount: null, untilDate: null }) === null);
  check('daysOfWeek non-entier (1.5) → null', normalizeReminderRecurrence({ frequency: 'weekly', daysOfWeek: [1.5], occurrenceCount: null, untilDate: null }) === null);
  check('occurrenceCount = 0 → null (jamais 0 occurrence silencieuse)', normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: 0, untilDate: null }) === null);
  check('occurrenceCount négatif → null', normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: -3, untilDate: null }) === null);
  check('occurrenceCount non-entier → null', normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: 2.5, untilDate: null }) === null);
  check('untilDate mal formée (format) → null', normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: null, untilDate: '25/09/2026' }) === null);
  check('untilDate calendaire inexistante (30 février) → null', normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: null, untilDate: '2026-02-30' }) === null);
  check('untilDate mois invalide (13) → null', normalizeReminderRecurrence({ frequency: 'daily', occurrenceCount: null, untilDate: '2026-13-01' }) === null);
  check('raw non-objet (string) → null', normalizeReminderRecurrence('daily') === null);
  check('raw null → null', normalizeReminderRecurrence(null) === null);
  check('raw undefined → null', normalizeReminderRecurrence(undefined) === null);
}

console.log('\n[§C] reminderRecurrenceMatchesDate — motif pur, sans les bornes');
{
  const daily: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
  check('daily → toujours vrai, quel que soit le jour', reminderRecurrenceMatchesDate(daily, { year: 2026, month: 8, day: 17 }));

  const mondays: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1], occurrenceCount: null, untilDate: null };
  // 2026-09-21 est un lundi (vérifié dynamiquement, jamais supposé à la main).
  const aMonday = new Date(2026, 8, 21);
  check('2026-09-21 est bien un lundi (fixture)', aMonday.getDay() === 1);
  check('weekly [lundi] → vrai un lundi', reminderRecurrenceMatchesDate(mondays, { year: 2026, month: 8, day: 21 }));
  check('weekly [lundi] → faux un mardi (le lendemain)', !reminderRecurrenceMatchesDate(mondays, { year: 2026, month: 8, day: 22 }));

  const weekend: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [0, 6], occurrenceCount: null, untilDate: null };
  check('weekly [dim,sam] → vrai un dimanche', reminderRecurrenceMatchesDate(weekend, { year: 2026, month: 8, day: 20 })); // 2026-09-20 = dimanche
  check('weekly [dim,sam] → faux un mercredi', !reminderRecurrenceMatchesDate(weekend, { year: 2026, month: 8, day: 23 }));
}

// ============================================================================================
console.log('\n[§D] computeNextReminderOccurrences — tous les jours SANS FIN');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
  const anchor = new Date(2026, 8, 17, 21, 40, 0);
  const occ = computeNextReminderOccurrences(rule, anchor, { limit: 10 });
  check('10 occurrences générées (limite explicite, jamais une boucle infinie réelle)', occ.length === 10);
  check('toutes espacées d’exactement 1 jour, même heure', occ.every((o, i) => i === 0 || (o.getTime() - occ[i - 1].getTime()) === 24 * 3600 * 1000));
  check('heure conservée sur toutes les occurrences (21:40)', occ.every((o) => hm(o) === '21:40'));

  const withoutLimit = computeNextReminderOccurrences(rule, anchor);
  check(`sans limite explicite → borne par défaut (100), jamais un tableau vide ni infini`, withoutLimit.length === 100);
}

console.log('\n[§E] computeNextReminderOccurrences — tous les jours pendant 5 occurrences');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null };
  const anchor = new Date(2026, 8, 17, 21, 40, 0);
  const occ = computeNextReminderOccurrences(rule, anchor, { limit: 1000 });
  check('exactement 5 occurrences (occurrenceCount respecté même avec une limite bien plus grande)', occ.length === 5);
  check(
    'dates consécutives correctes (17 au 21 septembre)',
    occ.map(ymd).join(',') === '2026-09-17,2026-09-18,2026-09-19,2026-09-20,2026-09-21',
  );
}

console.log('\n[§F] computeNextReminderOccurrences — tous les jours jusqu’au 25 septembre INCLUS');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: '2026-09-25' };
  const anchor = new Date(2026, 8, 20, 8, 0, 0);
  const occ = computeNextReminderOccurrences(rule, anchor, { limit: 100 });
  check('6 jours (20,21,22,23,24,25) — le 25 est INCLUS', occ.length === 6 && ymd(occ[occ.length - 1]) === '2026-09-25');
  check('aucune occurrence le 26 (borne strictement respectée)', !occ.some((o) => ymd(o) === '2026-09-26'));
}

console.log('\n[§G] computeNextReminderOccurrences — lundi à vendredi');
{
  const rule: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5], occurrenceCount: 10, untilDate: null };
  const anchor = new Date(2026, 8, 21, 8, 0, 0); // lundi 2026-09-21 (vérifié en §C)
  const occ = computeNextReminderOccurrences(rule, anchor);
  check('10 occurrences générées', occ.length === 10);
  check('toutes tombent un jour ouvré (lundi-vendredi), jamais un week-end', occ.every((o) => o.getDay() >= 1 && o.getDay() <= 5));
  check('première occurrence = le lundi d’ancrage lui-même (2026-09-21)', ymd(occ[0]) === '2026-09-21');
  check('la semaine suivante reprend bien lundi (saute le week-end)', ymd(occ[5]) === '2026-09-28');
}

console.log('\n[§H] computeNextReminderOccurrences — chaque lundi');
{
  const rule: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1], occurrenceCount: 4, untilDate: null };
  const anchor = new Date(2026, 8, 21, 18, 0, 0); // lundi
  const occ = computeNextReminderOccurrences(rule, anchor);
  check('4 occurrences', occ.length === 4);
  check('toutes des lundis', occ.every((o) => o.getDay() === 1));
  check('espacées d’exactement 7 jours à chaque fois', occ.every((o, i) => i === 0 || (o.getTime() - occ[i - 1].getTime()) === 7 * 24 * 3600 * 1000));
}

console.log('\n[§I] computeNextReminderOccurrences — samedi ET dimanche');
{
  const rule: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [0, 6], occurrenceCount: 4, untilDate: null };
  const anchor = new Date(2026, 8, 19, 10, 0, 0); // 2026-09-19 = samedi
  check('fixture : 2026-09-19 est bien un samedi', anchor.getDay() === 6);
  const occ = computeNextReminderOccurrences(rule, anchor);
  check('4 occurrences', occ.length === 4);
  check('alternance samedi/dimanche stricte (0 ou 6 uniquement)', occ.every((o) => o.getDay() === 0 || o.getDay() === 6));
  check('première = le samedi d’ancrage (19), puis dimanche 20, puis samedi 26, dimanche 27', occ.map(ymd).join(',') === '2026-09-19,2026-09-20,2026-09-26,2026-09-27');
}

console.log('\n[§J] départ demain — la première occurrence n’est jamais "aujourd’hui" si reminderAt est demain');
{
  const today = new Date(2026, 8, 17);
  const tomorrow = new Date(2026, 8, 18, 9, 0, 0);
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: 3, untilDate: null };
  const occ = computeNextReminderOccurrences(rule, tomorrow);
  check('la 1re occurrence est bien "demain" (2026-09-18), jamais "aujourd’hui"', ymd(occ[0]) === '2026-09-18' && ymd(occ[0]) !== ymd(today));
  check('3 occurrences consécutives à partir de demain', occ.map(ymd).join(',') === '2026-09-18,2026-09-19,2026-09-20');
}

console.log('\n[§K] la première occurrence (reminderAt) est TOUJOURS incluse quand elle correspond à la règle');
{
  const rule: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [3], occurrenceCount: 1, untilDate: null };
  const aWednesday = new Date(2026, 8, 23, 12, 0, 0); // 2026-09-23 = mercredi
  check('fixture : 2026-09-23 est bien un mercredi', aWednesday.getDay() === 3);
  const occ = computeNextReminderOccurrences(rule, aWednesday);
  check('occurrence unique = exactement reminderAt', occ.length === 1 && occ[0].getTime() === aWednesday.getTime());
}

console.log('\n[§L] borne déjà dépassée — untilDate antérieure au jour d’ancrage → aucune occurrence, jamais une exception');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: '2026-09-10' };
  const anchor = new Date(2026, 8, 17, 21, 40, 0); // après le 10 septembre
  const occ = computeNextReminderOccurrences(rule, anchor);
  check('aucune occurrence générée', occ.length === 0);
}

console.log('\n[§M] options.from — filtre sans renuméroter la série (occurrenceCount reste celui de la série entière)');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null };
  const anchor = new Date(2026, 8, 17, 21, 40, 0);
  const from = new Date(2026, 8, 19); // exclut les 2 premières occurrences (17, 18)
  const occ = computeNextReminderOccurrences(rule, anchor, { from });
  check('3 occurrences restantes (5 - 2 déjà passées), jamais 5 nouvelles', occ.length === 3);
  check('la première restante est bien le 19', ymd(occ[0]) === '2026-09-19');
}

console.log('\n[§N] passage fin de mois — arithmétique LOCALE, jamais un décalage UTC');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null };
  const anchor = new Date(2026, 0, 30, 9, 0, 0); // 30 janvier 2026 (2026 n’est pas bissextile)
  const occ = computeNextReminderOccurrences(rule, anchor);
  check(
    'Jan30, Jan31, Feb1, Feb2, Feb3 — enjambe correctement la fin du mois',
    occ.map(ymd).join(',') === '2026-01-30,2026-01-31,2026-02-01,2026-02-02,2026-02-03',
  );
}

console.log('\n[§O] passage fin d’année — arithmétique LOCALE, jamais un décalage UTC');
{
  const rule: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null };
  const anchor = new Date(2026, 11, 30, 9, 0, 0); // 30 décembre 2026
  const occ = computeNextReminderOccurrences(rule, anchor);
  check(
    'Dec30, Dec31, Jan1(2027), Jan2, Jan3 — enjambe correctement le changement d’année',
    occ.map(ymd).join(',') === '2026-12-30,2026-12-31,2027-01-01,2027-01-02,2027-01-03',
  );
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
