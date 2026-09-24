// CHANTIER "Badge binaire" (2026-09-24) — badge de l'icône = indicateur binaire : toute notification de
// rappel est programmée avec `badge: 1` (constant, jamais 2/3/…), remis à 0 au cold start et au retour
// au premier plan. notifications.ts/store.tsx importent react-native/expo : câblage par source-grep ;
// `clearAppBadge` est EXTRAITE et EXÉCUTÉE pour de vrai avec un module Notifications simulé.
//
// Usage : npx tsx scripts/test-regression-notification-badge.ts

import * as fs from 'fs';
import * as path from 'path';
import { REMINDER_BADGE_VALUE } from '../src/lib/notificationPlanning';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const notifSrc = read('src', 'lib', 'notifications.ts');
const storeSrc = read('src', 'data', 'store.tsx');
const planningSrc = read('src', 'lib', 'notificationPlanning.ts');

console.log('\n[Valeur] badge binaire constant');
check('REMINDER_BADGE_VALUE === 1', REMINDER_BADGE_VALUE === 1);
check('aucune autre valeur de badge (2/3/…) dans le code de planification/notifications', !/badge:\s*(?!REMINDER_BADGE_VALUE)[^,}\s]+/.test(notifSrc + planningSrc));
check('aucun compteur incrémental (+1 / ++ sur un badge / AsyncStorage badge)', !/badge\s*\+\+|badge\s*\+=|badgeCount\s*\+|getBadgeCountAsync|pensif\.badge/i.test(notifSrc + storeSrc + planningSrc));

console.log('\n[Planification] badge: 1 sur toute notification de rappel');
const fnMatch = notifSrc.match(/async function scheduleOneCandidate\([\s\S]*?\n\}\n/);
check('scheduleOneCandidate trouvée (point UNIQUE de programmation des candidats)', !!fnMatch);
const fn = fnMatch ? fnMatch[0] : '';
check('content contient badge: REMINDER_BADGE_VALUE', /content: \{ title: c\.title, body: c\.body, sound: true, badge: REMINDER_BADGE_VALUE,/.test(fn));
check('one-shot (DATE), recurrence finie (DATE), daily (DAILY), weekly (WEEKLY) passent tous par ce même appel', /SchedulableTriggerInputTypes\.DATE/.test(fn) && /SchedulableTriggerInputTypes\.DAILY/.test(fn) && /SchedulableTriggerInputTypes\.WEEKLY/.test(fn) && (fn.match(/scheduleNotificationAsync\(/g) ?? []).length === 1);
check('scheduleOneCandidate est le seul appelant de scheduleNotificationAsync pour les rappels (hors helper de test DEV)', (notifSrc.match(/Notifications\.scheduleNotificationAsync\(/g) ?? []).length === 2 && notifSrc.includes("title: '🧪 Test Pensif'"));
check('budget 56 / logique de planning inchangés', /export const MAX_SCHEDULED_NOTIFICATIONS = 56;/.test(planningSrc));

console.log('\n[Foreground] shouldSetBadge reste false');
check('handler foreground : shouldSetBadge: false', /shouldSetBadge: false,/.test(notifSrc) && !/shouldSetBadge: true/.test(notifSrc));

console.log('\n[clearAppBadge] exécution réelle avec Notifications simulé');
const clearMatch = notifSrc.match(/export async function clearAppBadge\(\): Promise<void> \{([\s\S]*?)\n\}\n/);
check('clearAppBadge exportée depuis notifications.ts (helper canonique)', !!clearMatch);
async function runClear(platformOS: string, setBadge: (n: number) => Promise<boolean>): Promise<void> {
  const body = clearMatch![1];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fnRun = new AsyncFunction('Platform', 'Notifications', body);
  await fnRun({ OS: platformOS }, { setBadgeCountAsync: setBadge });
}
(async () => {
  const calls: number[] = [];
  await runClear('ios', async (n) => (calls.push(n), true));
  check('appelle setBadgeCountAsync(0) une fois', calls.length === 1 && calls[0] === 0, JSON.stringify(calls));

  let threw = false;
  try { await runClear('ios', async () => false); } catch { threw = true; }
  check('permission badge indisponible (résout false) → aucune exception', !threw);

  threw = false;
  try { await runClear('android', async () => { throw new Error('launcher sans badge'); }); } catch { threw = true; }
  check('exception native → avalée silencieusement (aucune exception remontée)', !threw);

  const webCalls: number[] = [];
  await runClear('web', async (n) => (webCalls.push(n), true));
  check('web : ne fait rien', webCalls.length === 0);

  console.log('\n[Cold start + AppState] câblage store.tsx');
  check('import de clearAppBadge depuis ../lib/notifications', /import \{[^}]*clearAppBadge[^}]*\} from '\.\.\/lib\/notifications';/.test(storeSrc));
  check('cold start : useEffect(..., []) au montage appelle clearAppBadge()', /useEffect\(\(\) => \{\s*void clearAppBadge\(\);\s*\}, \[\]\);/.test(storeSrc));
  const drainBlock = storeSrc.match(/if \(state === 'active'\) \{[\s\S]*?setToday\(new Date\(\)\);[\s\S]*?void restoreSessionThenDrain\(\);\s*\}/);
  check('AppState → active : clearAppBadge() dans le listener existant, avec refresh today + restoreSessionThenDrain conservés', !!drainBlock && /void clearAppBadge\(\);/.test(drainBlock[0]) && /setToday\(new Date\(\)\);/.test(drainBlock[0]) && /void restoreSessionThenDrain\(\);/.test(drainBlock[0]));
  check('toujours exactement 3 listeners AppState (aucun listener ajouté)', (storeSrc.match(/AppState\.addEventListener\('change',/g) ?? []).length === 3);
  check('resync notifications au retour actif conservée (rescheduleAllReminders)', /rescheduleAllReminders\(contacts, pensees, new Date\(\), userName\)/.test(storeSrc));

  console.log('\n[Non-régression] permissions / récurrence non touchées');
  check('aucune popup/permission ajoutée pour le badge (requestPermissionsAsync inchangé, sans allowBadge explicite)', !/allowBadge/.test(notifSrc));
  check('requestNotificationPermissionIfUndetermined inchangé', /if \(status !== 'undetermined'\) return null;\s*return ensureNotificationPermissions\(\);/.test(notifSrc));

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
})();
