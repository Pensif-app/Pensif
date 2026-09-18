// Tests de non-régression — CHANTIER "Pensif — Notifications récurrentes V1, incrément 3 : Décision
// overflow >56" (2026-09-18). Couvre le nouveau moteur de sélection par GROUPES ATOMIQUES
// (`selectCandidateGroupsToSchedule`, notificationPlanning.ts, pur) et, par lecture de source,
// l'ordre corrigé dans `notifications.ts` (planning résolu AVANT toute annulation de l'existant).
//
// Usage : npx tsx scripts/test-regression-notification-capacity-groups.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  NotificationCandidate,
  OneShotCandidate,
  RecurringWeeklyCandidate,
  MAX_SCHEDULED_NOTIFICATIONS,
  selectCandidateGroupsToSchedule,
  buildPenseeReminderCandidates,
} from '../src/lib/notificationPlanning';
import { Pensee, ReminderRecurrence } from '../src/data/types';

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

const NOW = new Date(2026, 8, 18, 8, 0, 0, 0);

/** Un candidat oneShot issu d'une pensée — `index` détermine le jour de déclenchement (proximité). */
function pOneShot(penseeId: string, index: number, tier: 0 | 1 = 0): OneShotCandidate {
  return {
    kind: 'oneShot',
    identifier: `pensee-${penseeId}-occ-${index}`,
    triggerAt: new Date(2026, 8, 19 + index, 21, 0, 0, 0),
    tier,
    title: '💭 Pensée',
    body: 'texte',
    data: { kind: 'pensee', penseeId },
  };
}

/** Une "série" de `count` occurrences pour UNE pensée (simule une récurrence finie) — toutes
 *  partagent le même `penseeId`, donc le même groupe atomique (voir candidateGroupKey). */
function series(penseeId: string, count: number, startIndex = 0, tier: 0 | 1 = 0): OneShotCandidate[] {
  return Array.from({ length: count }, (_, i) => pOneShot(penseeId, startIndex + i, tier));
}

/** Un rappel ponctuel isolé (groupe de 1) — `dayOffset` élevé = priorité de proximité plus faible. */
function ponctual(penseeId: string, dayOffset: number, tier: 0 | 1 = 0): OneShotCandidate {
  return pOneShot(penseeId, dayOffset);
}

/** Un trigger recurringDaily isolé (groupe de 1, proximityMs = -Infinity comme tout candidat
 *  récurrent) — utilisé pour construire un remplissage qui bat de manière déterministe un AUTRE
 *  groupe récurrent à tier égal (l'ordre de tri est alors stable = ordre d'insertion, voir
 *  candidateGroupKey/groupCandidates). */
function recurringDailyFiller(penseeId: string): NotificationCandidate {
  return { kind: 'recurringDaily', identifier: `pensee-${penseeId}-daily`, hour: 9, minute: 0, tier: 0, title: 't', body: 'b', data: { kind: 'pensee', penseeId } };
}

function birthday(id: string, dayOffset: number, tier: 0 | 1 = 0): OneShotCandidate {
  return {
    kind: 'oneShot',
    identifier: `birthday-${id}-${tier}`,
    triggerAt: new Date(2026, 8, 19 + dayOffset, 9, 0, 0, 0),
    tier,
    title: '🎂',
    body: 'b',
    data: { kind: 'birthday', contactId: id },
  };
}

function countForPensee(scheduled: NotificationCandidate[], penseeId: string): number {
  return scheduled.filter((c) => c.data.kind === 'pensee' && c.data.penseeId === penseeId).length;
}

// ============================================================================================
console.log('\n[§1] série finie de 100 occurrences + rappel ponctuel → série entièrement rejetée, ponctuel conservé');
{
  const big = series('big', 100, 0); // proximité : à partir du 19 septembre (index 0)
  const small = ponctual('small', 200); // très loin dans le temps → proximité plus faible que "big"
  const result = selectCandidateGroupsToSchedule([...big, small], NOW);
  check('groupe "big" (100) entièrement rejeté', countForPensee(result.scheduledCandidates, 'big') === 0);
  check('le rappel ponctuel "small" reste programmé malgré le rejet de "big"', countForPensee(result.scheduledCandidates, 'small') === 1);
  check('rejectedGroups contient "big" avec requiredSlots=100', result.rejectedGroups.some((g) => g.penseeId === 'big' && g.reason === 'capacity' && g.requiredSlots === 100));
  check('scheduledCandidates.length <= 56', result.scheduledCandidates.length <= MAX_SCHEDULED_NOTIFICATIONS, `${result.scheduledCandidates.length}`);
}

console.log('\n[§2] série finie de 40 + 20 autres rappels indépendants (total 60 > 56) → JAMAIS une série partielle');
{
  // "A" (40) proximité LOINTAINE (index élevé) — volontairement moins prioritaire que les 20 autres,
  // pour forcer le cas où "A" doit être ENTIÈREMENT rejetée (elle ne rentre plus dans les 36 slots
  // restants après les 20 autres) plutôt que scindée.
  const seriesA = series('A', 40, 500);
  const others = Array.from({ length: 20 }, (_, i) => ponctual(`other-${i}`, i));
  const result = selectCandidateGroupsToSchedule([...others, ...seriesA], NOW);
  const countA = countForPensee(result.scheduledCandidates, 'A');
  check('"A" est SOIT 0 SOIT 40 — jamais une valeur intermédiaire', countA === 0 || countA === 40, `${countA}`);
  check('"A" est effectivement 0 dans ce scénario (36 slots restants < 40)', countA === 0);
  check('les 20 autres rappels sont tous conservés (aucun impact du rejet de "A")', others.every((c) => result.scheduledCandidates.includes(c)));
  check('scheduledCandidates.length <= 56', result.scheduledCandidates.length <= MAX_SCHEDULED_NOTIFICATIONS);
}

console.log('\n[§3] un groupe trop gros rencontré n’interrompt PAS l’examen des groupes suivants (même après un rejet, même moins prioritaires)');
{
  const huge = series('huge', 100, 0); // le plus proche → examiné en premier, rejeté
  const mid = ponctual('mid', 150); // plus loin → examiné ensuite
  const far = ponctual('far', 300); // encore plus loin → examiné en dernier
  const result = selectCandidateGroupsToSchedule([...huge, mid, far], NOW);
  check('"huge" rejeté', countForPensee(result.scheduledCandidates, 'huge') === 0);
  check('"mid" (examiné APRÈS le rejet) est bien programmé', countForPensee(result.scheduledCandidates, 'mid') === 1);
  check('"far" (encore après) est AUSSI bien programmé — l’examen continue jusqu’au bout', countForPensee(result.scheduledCandidates, 'far') === 1);
}

console.log('\n[§4] deux séries finies concurrentes (30 + 30 = 60 > 56) → chacune ENTIÈREMENT présente ou ENTIÈREMENT absente');
{
  const seriesX = series('X', 30, 0); // plus proche → priorité
  const seriesY = series('Y', 30, 1000); // plus loin → moins prioritaire
  const result = selectCandidateGroupsToSchedule([...seriesX, ...seriesY], NOW);
  const countX = countForPensee(result.scheduledCandidates, 'X');
  const countY = countForPensee(result.scheduledCandidates, 'Y');
  check('X est 0 ou 30 (jamais intermédiaire)', countX === 0 || countX === 30, `${countX}`);
  check('Y est 0 ou 30 (jamais intermédiaire)', countY === 0 || countY === 30, `${countY}`);
  check('X (prioritaire) est programmée intégralement (30)', countX === 30);
  check('Y (moins prioritaire, ne rentre plus dans les 26 slots restants) est rejetée intégralement (0)', countY === 0);
  check('scheduledCandidates.length <= 56', result.scheduledCandidates.length <= MAX_SCHEDULED_NOTIFICATIONS, `${result.scheduledCandidates.length}`);
}

console.log('\n[§5] weekly multi-jours (lundi-vendredi) — comportement de GROUPE cohérent : les 5 triggers ensemble, jamais séparés');
{
  const weeklyRule: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5], occurrenceCount: null, untilDate: null };
  const pensee: Pensee = { id: 'p-mf', texte: 't', contactId: null, createdAt: '2026-01-01T00:00:00.000Z', reminderAt: new Date(2026, 8, 21, 8, 0, 0, 0).toISOString(), reminderRecurrence: weeklyRule };
  const weeklyCandidates = buildPenseeReminderCandidates(pensee, NOW);
  check('5 candidats recurringWeekly produits en amont', weeklyCandidates.length === 5 && weeklyCandidates.every((c) => c.kind === 'recurringWeekly'));

  // Beaucoup de remplissage MOINS prioritaire (proximité lointaine) pour vérifier que le groupe
  // weekly (prioritaire, recurring → proximityMs = -Infinity) passe intégralement AVANT eux.
  const filler = Array.from({ length: 55 }, (_, i) => ponctual(`filler-${i}`, 1000 + i));
  const result = selectCandidateGroupsToSchedule([...filler, ...weeklyCandidates], NOW);
  const scheduledWeekly = result.scheduledCandidates.filter((c) => c.kind === 'recurringWeekly') as RecurringWeeklyCandidate[];
  check('les 5 triggers weekly sont TOUS programmés ensemble (jamais 3 sur 5)', scheduledWeekly.length === 5, `${scheduledWeekly.length}`);
  check('weekdays = les 5 jours de la règle, complets', JSON.stringify(scheduledWeekly.map((c) => c.weekday).sort((a, b) => a - b)) === JSON.stringify([1, 2, 3, 4, 5]));

  // Cas inverse : le groupe weekly est REJETÉ (trop de remplissage plus prioritaire) → doit rester à
  // 0 exactement, jamais une fraction (ex. seulement 2 jours programmés). Un candidat récurrent a
  // TOUJOURS proximityMs = -Infinity (voir CandidateGroup) : pour le battre de façon déterministe, le
  // remplissage doit être LUI AUSSI récurrent (tri stable → ordre d'insertion décide à égalité).
  const priorityFiller = Array.from({ length: 55 }, (_, i) => recurringDailyFiller(`priority-filler-${i}`));
  const result2 = selectCandidateGroupsToSchedule([...priorityFiller, ...weeklyCandidates], NOW);
  const scheduledWeekly2 = result2.scheduledCandidates.filter((c) => c.kind === 'recurringWeekly');
  check('groupe weekly rejeté → 0 (jamais une fraction)', scheduledWeekly2.length === 0, `${scheduledWeekly2.length}`);
  check('rejectedGroups documente précisément ce rejet (penseeId=p-mf, requiredSlots=5)', result2.rejectedGroups.some((g) => g.penseeId === 'p-mf' && g.requiredSlots === 5 && g.reason === 'capacity'));
}

console.log('\n[§6] scheduledCandidates.length <= 56, quelle que soit la charge en entrée');
{
  const stress: NotificationCandidate[] = [
    ...series('finite-1', 25, 0),
    ...series('finite-2', 25, 500),
    ...Array.from({ length: 30 }, (_, i) => birthday(`c-${i}`, i, i % 2 === 0 ? 0 : 1)),
    ...Array.from({ length: 10 }, (_, i) => ponctual(`solo-${i}`, 2000 + i)),
  ];
  const result = selectCandidateGroupsToSchedule(stress, NOW);
  check(`scheduledCandidates.length (${result.scheduledCandidates.length}) <= ${MAX_SCHEDULED_NOTIFICATIONS}`, result.scheduledCandidates.length <= MAX_SCHEDULED_NOTIFICATIONS);
  check('requiredSlots reflète la demande totale réelle', result.requiredSlots === stress.length, `${result.requiredSlots} vs ${stress.length}`);
  check('scheduledSlots = scheduledCandidates.length', result.scheduledSlots === result.scheduledCandidates.length);
}

console.log('\n[§7] rejectedGroups explique PRÉCISÉMENT chaque rejet (groupKey, penseeId, reason, requiredSlots exacts)');
{
  const rejected = series('reject-me', 70, 0); // ne peut jamais tenir seule (70 > 56)
  const result = selectCandidateGroupsToSchedule(rejected, NOW);
  check('0 candidat programmé (le seul groupe ne rentre pas)', result.scheduledCandidates.length === 0);
  check('exactement 1 groupe rejeté', result.rejectedGroups.length === 1, `${result.rejectedGroups.length}`);
  const g = result.rejectedGroups[0];
  check('groupKey = pensee-reject-me', g?.groupKey === 'pensee-reject-me');
  check('penseeId = reject-me', g?.penseeId === 'reject-me');
  check('reason = capacity', g?.reason === 'capacity');
  check('requiredSlots = 70 (taille EXACTE du groupe, jamais une valeur tronquée)', g?.requiredSlots === 70);
}

console.log('\n[§8] aucun overflow global ne produit automatiquement zéro planning — les autres rappels restent programmés');
{
  const overflowing = series('overflow-series', 80, 0); // demande globale > 56 à elle seule
  const bday = birthday('safe-bday', 5);
  const result = selectCandidateGroupsToSchedule([...overflowing, bday], NOW);
  check('requiredSlots > 56 (overflow global réel)', result.requiredSlots > MAX_SCHEDULED_NOTIFICATIONS, `${result.requiredSlots}`);
  check('le planning n’est PAS vide (l’anniversaire survit malgré l’overflow global)', result.scheduledCandidates.length > 0);
  check('l’anniversaire est bien celui qui est programmé', result.scheduledCandidates.includes(bday));
}

// ============================================================================================
console.log('\n[§9 — source] le planning final est résolu AVANT tout cancelAllScheduledNotificationsAsync (jamais l’inverse)');
{
  const src = readSrc('src', 'lib', 'notifications.ts');
  const idxSelection = src.indexOf('const selection = selectCandidateGroupsToSchedule(allCandidates, new Date());');
  // Il existe DEUX appels à cancelAllScheduledNotificationsAsync : celui de la branche "permission
  // non accordée" (nettoyage, aucun planning à protéger) et celui du chemin normal, qui doit
  // désormais se trouver APRÈS la résolution du planning.
  const idxCancelAfterSelection = src.indexOf('await Notifications.cancelAllScheduledNotificationsAsync();', idxSelection);
  check('selectCandidateGroupsToSchedule trouvé', idxSelection !== -1);
  check(
    'le cancelAll du chemin normal (après résolution de capacité) suit bien la résolution du planning, jamais l’inverse',
    idxSelection !== -1 && idxCancelAfterSelection !== -1 && idxCancelAfterSelection > idxSelection,
  );
  check(
    'le cancelAll du chemin normal précède l’appel au moteur d’atomicité (scheduleCandidateGroupsAtomically, incrément 3)',
    idxCancelAfterSelection !== -1 && idxCancelAfterSelection < src.indexOf('scheduleCandidateGroupsAtomically(selection.scheduledCandidates,'),
  );
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
