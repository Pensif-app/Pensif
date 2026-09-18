// Tests de non-régression — CHANTIER "Pensif — Notifications récurrentes V1, incrément 3 : atomicité
// réelle du scheduling" (2026-09-18). Couvre `scheduleCandidateGroupsAtomically`
// (notificationPlanning.ts, pure — aucune dépendance expo-notifications, les effets de bord passent
// par des doublures `schedule`/`cancel` simulées ici, exactement comme le fera `notifications.ts` en
// production avec les vrais appels Expo).
//
// Usage : npx tsx scripts/test-regression-notification-scheduling-rollback.ts

import { NotificationCandidate, OneShotCandidate, scheduleCandidateGroupsAtomically } from '../src/lib/notificationPlanning';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function occ(penseeId: string, index: number): OneShotCandidate {
  return {
    kind: 'oneShot',
    identifier: `pensee-${penseeId}-occ-${index}`,
    triggerAt: new Date(2026, 8, 19 + index, 21, 0, 0, 0),
    tier: 0,
    title: '💭 Pensée',
    body: 'texte',
    data: { kind: 'pensee', penseeId },
  };
}

function weeklyDay(penseeId: string, weekday: number): NotificationCandidate {
  return { kind: 'recurringWeekly', identifier: `pensee-${penseeId}-weekly-${weekday}`, weekday, hour: 8, minute: 0, tier: 0, title: 't', body: 'b', data: { kind: 'pensee', penseeId } };
}

function birthday(id: string): OneShotCandidate {
  return { kind: 'oneShot', identifier: `birthday-${id}-current`, triggerAt: new Date(2026, 8, 20, 9, 0, 0, 0), tier: 0, title: '🎂', body: 'b', data: { kind: 'birthday', contactId: id } };
}

/** Fabrique des doublures `schedule`/`cancel` qui journalisent tous les appels reçus, avec un plan
 *  d'échecs configurable (par `identifier`). Simule EXACTEMENT ce qu'un `scheduleNotificationAsync`/
 *  `cancelScheduledNotificationAsync` réel ferait, sans aucune dépendance à expo-notifications. */
function makeOps(opts: { failScheduleOn?: Set<string>; failCancelOn?: Set<string> } = {}) {
  const scheduledCalls: string[] = [];
  const cancelledCalls: string[] = [];
  const cancelErrors: { identifier: string; error: unknown }[] = [];

  async function schedule(candidate: NotificationCandidate) {
    if (opts.failScheduleOn?.has(candidate.identifier)) throw new Error(`échec simulé de scheduleNotificationAsync pour ${candidate.identifier}`);
    scheduledCalls.push(candidate.identifier);
  }
  async function cancel(identifier: string) {
    if (opts.failCancelOn?.has(identifier)) throw new Error(`échec simulé de cancelScheduledNotificationAsync pour ${identifier}`);
    cancelledCalls.push(identifier);
  }
  function onCancelError(identifier: string, error: unknown) {
    cancelErrors.push({ identifier, error });
  }

  return { schedule, cancel, onCancelError, scheduledCalls, cancelledCalls, cancelErrors };
}

async function main() {
// ============================================================================================
console.log('\n[§1] groupe 5/5 réussi → les 5 conservées, aucune annulation');
{
  const group = [occ('A', 0), occ('A', 1), occ('A', 2), occ('A', 3), occ('A', 4)];
  const ops = makeOps();
  const result = await scheduleCandidateGroupsAtomically(group, ops);
  check('5 appels schedule', ops.scheduledCalls.length === 5, `${ops.scheduledCalls.length}`);
  check('0 appel cancel', ops.cancelledCalls.length === 0);
  check('groupe pensee-A dans scheduledGroups', result.scheduledGroups.includes('pensee-A'));
  check('aucun groupe en échec', result.failedGroups.length === 0);
}

console.log('\n[§2] échec sur #3 → #1/#2 annulées, #4/#5 jamais appelées, groupe final 0/5');
{
  const group = [occ('A', 0), occ('A', 1), occ('A', 2), occ('A', 3), occ('A', 4)];
  const ops = makeOps({ failScheduleOn: new Set([occ('A', 2).identifier]) });
  const result = await scheduleCandidateGroupsAtomically(group, ops);
  check('#1 et #2 tentées (schedule)', ops.scheduledCalls.includes(occ('A', 0).identifier) && ops.scheduledCalls.includes(occ('A', 1).identifier));
  check('#3 tentée et a échoué (pas dans scheduledCalls)', !ops.scheduledCalls.includes(occ('A', 2).identifier));
  check('#4 et #5 JAMAIS appelées (arrêt immédiat du groupe)', !ops.scheduledCalls.includes(occ('A', 3).identifier) && !ops.scheduledCalls.includes(occ('A', 4).identifier));
  check('exactement 2 appels schedule au total (#1, #2)', ops.scheduledCalls.length === 2, `${ops.scheduledCalls.length}`);
  check('#1 et #2 annulées (rollback)', ops.cancelledCalls.includes(occ('A', 0).identifier) && ops.cancelledCalls.includes(occ('A', 1).identifier));
  check('exactement 2 appels cancel (jamais plus, jamais moins)', ops.cancelledCalls.length === 2, `${ops.cancelledCalls.length}`);
  check('groupe pensee-A dans failedGroups, reason=scheduling', result.failedGroups.some((g) => g.groupKey === 'pensee-A' && g.reason === 'scheduling' && g.penseeId === 'A'));
  check('aucun groupe dans scheduledGroups (0/5, jamais 2/5)', result.scheduledGroups.length === 0);
}

console.log('\n[§3] A succès / B échec (partiel) / C succès → A conservé, B rollback intégral, C programmé — isolation totale');
{
  const groupA = [occ('A', 0), occ('A', 1)];
  const groupB = [occ('B', 0), occ('B', 1), occ('B', 2)];
  const groupC = [occ('C', 0)];
  const ops = makeOps({ failScheduleOn: new Set([occ('B', 1).identifier]) });
  const result = await scheduleCandidateGroupsAtomically([...groupA, ...groupB, ...groupC], ops);
  check('A entièrement programmé (2 appels schedule pour A)', ops.scheduledCalls.filter((id) => id.startsWith('pensee-A-')).length === 2);
  check('A jamais annulé', !ops.cancelledCalls.some((id) => id.startsWith('pensee-A-')));
  check('B[0] programmé puis annulé (rollback)', ops.scheduledCalls.includes(occ('B', 0).identifier) && ops.cancelledCalls.includes(occ('B', 0).identifier));
  check('B[2] jamais tentée (arrêt du groupe B après l’échec de B[1])', !ops.scheduledCalls.includes(occ('B', 2).identifier));
  check('C entièrement programmé, jamais annulé', ops.scheduledCalls.includes(occ('C', 0).identifier) && !ops.cancelledCalls.includes(occ('C', 0).identifier));
  check('scheduledGroups = [pensee-A, pensee-C] (B absent)', result.scheduledGroups.includes('pensee-A') && result.scheduledGroups.includes('pensee-C') && !result.scheduledGroups.includes('pensee-B'));
  check('failedGroups = [pensee-B] uniquement', result.failedGroups.length === 1 && result.failedGroups[0].groupKey === 'pensee-B');
}

console.log('\n[§4] weekly 3 jours, échec au deuxième → premier annulé, troisième jamais programmé');
{
  const group = [weeklyDay('W', 1), weeklyDay('W', 3), weeklyDay('W', 5)]; // lundi, mercredi, vendredi
  const ops = makeOps({ failScheduleOn: new Set([weeklyDay('W', 3).identifier]) });
  const result = await scheduleCandidateGroupsAtomically(group, ops);
  check('lundi (premier) tenté puis annulé', ops.scheduledCalls.includes(weeklyDay('W', 1).identifier) && ops.cancelledCalls.includes(weeklyDay('W', 1).identifier));
  check('mercredi (deuxième) tenté, a échoué', !ops.scheduledCalls.includes(weeklyDay('W', 3).identifier));
  check('vendredi (troisième) JAMAIS programmé', !ops.scheduledCalls.includes(weeklyDay('W', 5).identifier));
  check('résultat final 0/3 pour cette pensée', result.scheduledGroups.length === 0 && result.failedGroups.length === 1 && result.failedGroups[0].groupKey === 'pensee-W');
}

console.log('\n[§5] échec au tout premier candidat → aucune tentative de rollback inutile (rien à annuler)');
{
  const group = [occ('A', 0), occ('A', 1), occ('A', 2)];
  const ops = makeOps({ failScheduleOn: new Set([occ('A', 0).identifier]) });
  const result = await scheduleCandidateGroupsAtomically(group, ops);
  check('un seul appel schedule tenté (le premier, qui échoue)', ops.scheduledCalls.length === 0 && result.failedGroups.length === 1);
  check('AUCUN appel cancel (rien n’avait réussi)', ops.cancelledCalls.length === 0, `${ops.cancelledCalls.length}`);
}

console.log('\n[§6] une annulation de rollback échoue → les autres annulations sont quand même tentées, pas de crash');
{
  const group = [occ('A', 0), occ('A', 1), occ('A', 2), occ('A', 3)];
  // #1, #2, #3 réussissent puis #4 échoue → rollback de #1/#2/#3 ; simule un échec de cancel sur #2.
  const ops = makeOps({ failScheduleOn: new Set([occ('A', 3).identifier]), failCancelOn: new Set([occ('A', 1).identifier]) });
  let threw = false;
  let result;
  try {
    result = await scheduleCandidateGroupsAtomically(group, ops);
  } catch {
    threw = true;
  }
  check('scheduleCandidateGroupsAtomically ne lève jamais d’exception (pas de crash du reschedule)', !threw);
  check('cancel tenté pour #1, #2 (échoue) et #3 malgré l’échec de #2', ops.cancelledCalls.includes(occ('A', 0).identifier) && ops.cancelledCalls.includes(occ('A', 2).identifier));
  check('#2 absent de cancelledCalls (son cancel a échoué) mais onCancelError a bien été notifié', !ops.cancelledCalls.includes(occ('A', 1).identifier) && ops.cancelErrors.some((e) => e.identifier === occ('A', 1).identifier));
  check('le groupe est quand même marqué en échec (0/4)', !!result && result.scheduledGroups.length === 0 && result.failedGroups.length === 1);
}

console.log('\n[§7] groupe rejeté pour capacity → jamais envoyé à cette fonction (0 appel scheduleNotificationAsync)');
{
  // scheduleCandidateGroupsAtomically ne reçoit QUE selection.scheduledCandidates (déjà filtré par
  // selectCandidateGroupsToSchedule, voir notifications.ts) — un groupe rejeté n'apparaît donc jamais
  // dans son entrée. Vérifié ici en lui passant un tableau VIDE (équivalent à "tout a été rejeté").
  const ops = makeOps();
  const result = await scheduleCandidateGroupsAtomically([], ops);
  check('0 appel schedule', ops.scheduledCalls.length === 0);
  check('0 appel cancel', ops.cancelledCalls.length === 0);
  check('aucun groupe programmé ni en échec', result.scheduledGroups.length === 0 && result.failedGroups.length === 0);
}

console.log('\n[§8] identifiers utilisés pour le rollback correspondent EXACTEMENT aux notifications effectivement programmées');
{
  const group = [occ('A', 0), occ('A', 1), occ('A', 2), occ('A', 3), occ('A', 4)];
  const ops = makeOps({ failScheduleOn: new Set([occ('A', 3).identifier]) }); // #1,#2,#3 réussissent, #4 échoue
  await scheduleCandidateGroupsAtomically(group, ops);
  const expectedScheduled = [occ('A', 0).identifier, occ('A', 1).identifier, occ('A', 2).identifier];
  check('scheduledCalls = EXACTEMENT #1,#2,#3 (dans cet ordre)', JSON.stringify(ops.scheduledCalls) === JSON.stringify(expectedScheduled), JSON.stringify(ops.scheduledCalls));
  check('cancelledCalls = EXACTEMENT les mêmes identifiers que scheduledCalls (aucun autre, aucun manquant)', JSON.stringify([...ops.cancelledCalls].sort()) === JSON.stringify([...expectedScheduled].sort()));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
