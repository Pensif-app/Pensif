// Tests de non-régression — CHANTIER "Pensif — Notifications récurrentes V1, incrément 1 : moteur de
// planning PUR" (2026-09-18). Teste `notificationPlanning.ts` (pur, sans expo-notifications/react-
// native) directement — voir test-regression-notifications.ts pour le même principe. Couvre
// exclusivement le NOUVEAU moteur (buildPenseeReminderCandidates, describeSlotRequirement) — le
// comportement historique (anniversaires/fêtes/pensées non récurrentes via buildCandidates) reste
// couvert par test-regression-notifications.ts, inchangé par ce chantier.
//
// Usage : npx tsx scripts/test-regression-notification-recurrence-planning.ts

import { Pensee, ReminderRecurrence } from '../src/data/types';
import {
  NotificationCandidate,
  OneShotCandidate,
  RecurringDailyCandidate,
  RecurringWeeklyCandidate,
  buildCandidates,
  buildPenseeReminderCandidates,
  describeSlotRequirement,
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

// 18 septembre 2026 est un VENDREDI (déjà établi dans les tests des chantiers Seeds temporels).
const FRI_18 = (h: number, m: number) => new Date(2026, 8, 18, h, m, 0, 0);

// ============================================================================================
console.log('\n[§1] rappel ponctuel (sans récurrence) — comportement STRICTEMENT inchangé : 1 oneShot');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-simple', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: null });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('exactement 1 candidat', candidates.length === 1, `${candidates.length}`);
  const c = candidates[0];
  check('kind = oneShot', isOneShot(c));
  if (isOneShot(c)) {
    check('triggerAt = reminderAt exact', c.triggerAt.getTime() === FRI_18(21, 0).getTime());
    check('tier = 0', c.tier === 0);
    check('identifiant = pensee-{id}-occ-{localDateTime}', c.identifier === 'pensee-p-simple-occ-2026-09-18T2100');
  }
}

console.log('\n[§1 bis] rappel ponctuel déjà passé → aucun candidat (comportement inchangé)');
{
  const now = new Date(2026, 8, 19, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-past', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: null });
  check('0 candidat', buildPenseeReminderCandidates(p, now).length === 0);
}

console.log('\n[§1 ter] sans reminderAt → aucun candidat, même avec une récurrence renseignée');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-none', reminderAt: null, reminderRecurrence: dailyRule() });
  check('0 candidat', buildPenseeReminderCandidates(p, now).length === 0);
}

// ============================================================================================
console.log('\n[§2] daily FINIE ×5 (occurrenceCount=5) → exactement 5 candidats oneShot, tous futurs');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0); // avant la première occurrence (21h)
  const p = makePensee({ id: 'p-5', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ occurrenceCount: 5 }) });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('5 candidats', candidates.length === 5, `${candidates.length}`);
  check('tous oneShot', candidates.every(isOneShot));
  const days = (candidates.filter(isOneShot) as OneShotCandidate[]).map((c) => c.triggerAt.getDate()).sort((a, b) => a - b);
  check('jours 18,19,20,21,22 (5 jours consécutifs à 21h)', JSON.stringify(days) === JSON.stringify([18, 19, 20, 21, 22]), JSON.stringify(days));
  check('toutes les occurrences sont futures (aucune passée)', candidates.every((c) => isOneShot(c) && c.triggerAt.getTime() > now.getTime()));
}

console.log('\n[§3] daily FINIE ×5 avec 2 occurrences déjà passées → 3 candidats restants');
{
  const now = new Date(2026, 8, 19, 22, 0, 0, 0); // après les occurrences du 18 et du 19 (21h)
  const p = makePensee({ id: 'p-5-partial', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ occurrenceCount: 5 }) });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('3 candidats restants', candidates.length === 3, `${candidates.length}`);
  const days = (candidates.filter(isOneShot) as OneShotCandidate[]).map((c) => c.triggerAt.getDate()).sort((a, b) => a - b);
  check('jours restants = 20,21,22 (18 et 19 déjà passés)', JSON.stringify(days) === JSON.stringify([20, 21, 22]), JSON.stringify(days));
  check('aucune occurrence passée produite', candidates.every((c) => isOneShot(c) && c.triggerAt.getTime() > now.getTime()));
}

console.log('\n[§4] untilDate INCLUSIF — daily jusqu’au 20/09/2026 → occurrences 18,19,20, jamais 21');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-until', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ untilDate: '2026-09-20' }) });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('3 candidats (18, 19, 20 — 20 inclus)', candidates.length === 3, `${candidates.length}`);
  const days = (candidates.filter(isOneShot) as OneShotCandidate[]).map((c) => c.triggerAt.getDate()).sort((a, b) => a - b);
  check('jours exacts 18,19,20 — jamais 21', JSON.stringify(days) === JSON.stringify([18, 19, 20]), JSON.stringify(days));
}

console.log('\n[§5] série FINIE entièrement passée → 0 candidat (jamais de rafale rétroactive)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({
    id: 'p-all-past',
    reminderAt: new Date(2026, 8, 1, 21, 0, 0, 0).toISOString(),
    reminderRecurrence: dailyRule({ occurrenceCount: 3 }), // 1, 2, 3 septembre — toutes avant `now` (18 septembre)
  });
  check('0 candidat', buildPenseeReminderCandidates(p, now).length === 0);
}

// ============================================================================================
console.log('\n[§6] daily INFINIE (occurrenceCount=null, untilDate=null) → exactement 1 recurringDaily');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-inf-daily', reminderAt: FRI_18(21, 40).toISOString(), reminderRecurrence: dailyRule() });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('1 candidat', candidates.length === 1, `${candidates.length}`);
  const c = candidates[0];
  check('kind = recurringDaily', isRecurringDaily(c));
  if (isRecurringDaily(c)) {
    check('heure/minute = celles de reminderAt (21:40)', c.hour === 21 && c.minute === 40);
    check('identifiant = pensee-{id}-daily', c.identifier === 'pensee-p-inf-daily-daily');
    check('tier = 0', c.tier === 0);
  }
}

console.log('\n[§7] daily INFINIE avec reminderAt initial PASSÉ → le trigger récurrent est TOUJOURS produit (jamais filtré comme "passé")');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-inf-old', reminderAt: new Date(2020, 0, 1, 21, 0, 0, 0).toISOString(), reminderRecurrence: dailyRule() });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('toujours exactement 1 recurringDaily malgré une ancre passée depuis des années', candidates.length === 1 && isRecurringDaily(candidates[0]));
}

// ============================================================================================
console.log('\n[§8] weekly INFINIE, 1 jour (lundi) → exactement 1 recurringWeekly');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-inf-mon', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1]) });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('1 candidat', candidates.length === 1, `${candidates.length}`);
  const c = candidates[0];
  check('kind = recurringWeekly, weekday = 1 (lundi)', isRecurringWeekly(c) && c.weekday === 1);
  if (isRecurringWeekly(c)) check('identifiant = pensee-{id}-weekly-1', c.identifier === 'pensee-p-inf-mon-weekly-1');
}

console.log('\n[§9] weekly INFINIE, lundi-vendredi [1,2,3,4,5] → EXACTEMENT 5 recurringWeekly (jamais 5 pensées, jamais des DATE)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-inf-week', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1, 2, 3, 4, 5]) });
  const candidates = buildPenseeReminderCandidates(p, now);
  check('5 candidats', candidates.length === 5, `${candidates.length}`);
  check('tous recurringWeekly (jamais oneShot)', candidates.every(isRecurringWeekly));
  const weekdays = (candidates.filter(isRecurringWeekly) as RecurringWeeklyCandidate[]).map((c) => c.weekday);
  check('weekdays = [1,2,3,4,5], ordre déterministe croissant', JSON.stringify(weekdays) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(weekdays));
  check('un seul penseeId source pour les 5 (une seule pensée, 5 triggers)', candidates.every((c) => c.data.kind === 'pensee' && c.data.penseeId === 'p-inf-week'));
}

console.log('\n[§10] weekdays DÉTERMINISTES — ordre brut du tableau source (et doublons) sans effet sur le résultat');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const scrambled = makePensee({ id: 'p-scrambled', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([5, 1, 3, 1, 2, 4, 5]) });
  const candidates = buildPenseeReminderCandidates(scrambled, now);
  const weekdays = (candidates.filter(isRecurringWeekly) as RecurringWeeklyCandidate[]).map((c) => c.weekday);
  check('dédupliqué + trié malgré un ordre brut mélangé et des doublons', JSON.stringify(weekdays) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(weekdays));
}

// ============================================================================================
console.log('\n[§11] IDs déterministes et UNIQUES');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-ids', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1, 2, 3, 4, 5]) });
  const candidates = buildPenseeReminderCandidates(p, now);
  const ids = candidates.map((c) => c.identifier);
  check('aucune collision entre les 5 identifiants', new Set(ids).size === ids.length, JSON.stringify(ids));
  check('tous préfixés par pensee-p-ids-weekly-', ids.every((id) => id.startsWith('pensee-p-ids-weekly-')));
}

console.log('\n[§12] deux appels identiques → planning STRICTEMENT identique (déterminisme, aucune dépendance à `now` interne)');
{
  const now = new Date(2026, 8, 18, 8, 0, 0, 0);
  const p = makePensee({ id: 'p-repeat', reminderAt: FRI_18(21, 0).toISOString(), reminderRecurrence: dailyRule({ occurrenceCount: 5 }) });
  const a = buildPenseeReminderCandidates(p, new Date(now));
  const b = buildPenseeReminderCandidates(p, new Date(now));
  const serialize = (list: NotificationCandidate[]) =>
    JSON.stringify(list.map((c) => ({ ...c, triggerAt: isOneShot(c) ? c.triggerAt.toISOString() : undefined })));
  check('sérialisation strictement identique entre les deux appels', serialize(a) === serialize(b));

  const pWeekly = makePensee({ id: 'p-repeat-weekly', reminderAt: FRI_18(8, 0).toISOString(), reminderRecurrence: weeklyRule([1, 3, 5]) });
  const c1 = buildPenseeReminderCandidates(pWeekly, new Date(now));
  const c2 = buildPenseeReminderCandidates(pWeekly, new Date(now));
  check('idem pour une récurrence infinie weekly', JSON.stringify(c1) === JSON.stringify(c2));
}

// ============================================================================================
console.log('\n[§13] anniversaires/fêtes/pensées non récurrentes — buildCandidates INCHANGÉ (nouveau discriminant kind ajouté, comportement identique)');
{
  const contact = {
    id: 'a1',
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-09-18',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme' as const,
    initials: 'T',
    color: 'sage' as const,
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
  };
  const today = new Date(2026, 8, 18);
  const candidates = buildCandidates([contact], [], today);
  const bday = candidates.find((c) => c.tier === 0 && c.data.kind === 'birthday');
  check('anniversaire jour J toujours présent', !!bday);
  check('kind = oneShot (comportement historique, jamais récurrent)', bday?.kind === 'oneShot');
  check('identifiant déterministe désormais porté (nouveauté additive, non exploitée par notifications.ts à cet incrément)', bday?.identifier === 'birthday-a1-current');
}

// ============================================================================================
console.log('\n[§14] détection EXPLICITE d’un besoin > 56 slots — jamais une troncature silencieuse');
{
  const under: NotificationCandidate[] = Array.from({ length: 40 }, (_, i) => ({
    kind: 'oneShot' as const,
    identifier: `x-${i}`,
    triggerAt: new Date(2026, 8, 18 + i),
    tier: 0 as const,
    title: 't',
    body: 'b',
    data: { kind: 'none' as const },
  }));
  const reqUnder = describeSlotRequirement(under);
  check('40 < 56 → overflow=false, excess=0', reqUnder.required === 40 && reqUnder.overflow === false && reqUnder.excess === 0, JSON.stringify(reqUnder));

  const exact: NotificationCandidate[] = Array.from({ length: MAX_SCHEDULED_NOTIFICATIONS }, (_, i) => ({
    kind: 'oneShot' as const,
    identifier: `y-${i}`,
    triggerAt: new Date(2026, 8, 18 + i),
    tier: 0 as const,
    title: 't',
    body: 'b',
    data: { kind: 'none' as const },
  }));
  const reqExact = describeSlotRequirement(exact);
  check('exactement 56 → overflow=false, excess=0 (jamais un faux positif à la limite)', reqExact.required === 56 && reqExact.overflow === false && reqExact.excess === 0);

  // Mélange oneShot/recurringDaily/recurringWeekly — chaque kind coûte EXACTEMENT 1 slot.
  const over: NotificationCandidate[] = [
    ...Array.from({ length: 50 }, (_, i) => ({
      kind: 'oneShot' as const,
      identifier: `z-${i}`,
      triggerAt: new Date(2026, 8, 18 + i),
      tier: 0 as const,
      title: 't',
      body: 'b',
      data: { kind: 'none' as const },
    })),
    { kind: 'recurringDaily' as const, identifier: 'pensee-1-daily', hour: 21, minute: 0, tier: 0 as const, title: 't', body: 'b', data: { kind: 'none' as const } },
    ...[1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
      kind: 'recurringWeekly' as const,
      identifier: `pensee-2-weekly-${weekday}`,
      weekday,
      hour: 8,
      minute: 0,
      tier: 0 as const,
      title: 't',
      body: 'b',
      data: { kind: 'none' as const },
    })),
  ];
  const reqOver = describeSlotRequirement(over);
  check('50 oneShot + 1 recurringDaily + 7 recurringWeekly = 58 slots requis', reqOver.required === 58, `${reqOver.required}`);
  check('58 > 56 → overflow=true, excess=2 — signalé EXPLICITEMENT, jamais tronqué silencieusement', reqOver.overflow === true && reqOver.excess === 2, JSON.stringify(reqOver));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
