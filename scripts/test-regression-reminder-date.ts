// Tests de non-régression — BUG PENSÉES V2 ANDROID (rappel pourtant futur rejeté comme "dans le
// passé" dans PenseeDetailScreen). Teste reminderDate.ts, pur, sans dépendance react-native — la
// construction du rappel se fait TOUJOURS à partir de composants locaux (jamais une réinterprétation
// UTC), et sa comparaison au "maintenant" se fait TOUJOURS par instant (getTime()), jamais par
// composants ni par chaîne. Lecture seule. Assertions dures : lève une exception (code de sortie
// non-nul) si une régression est détectée.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-reminder-date.ts
// (ajouter TZ=Europe/Paris pour le test DST #4, comme les autres scripts qui en ont besoin)

import { fromLocalDateTimeParts, isFutureReminder, toLocalDateTimeParts, withLocalDate, withLocalTime } from '../src/data/reminderDate';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] Rappel dans +2 minutes → reconnu comme futur');
{
  const now = new Date(2026, 5, 10, 14, 0, 0);
  const picked = new Date(2026, 5, 10, 14, 2, 0); // même jour, +2 min
  const reminder = withLocalTime(withLocalDate(now, picked), picked);
  check('reconstruit exactement +2 min', reminder.getTime() === picked.getTime(), reminder.toString());
  check('reconnu comme futur par rapport à "now"', isFutureReminder(reminder, now));
}

console.log('\n[2] Rappel demain à 9h → reconnu comme futur, quelle que soit l’heure actuelle');
{
  const now = new Date(2026, 5, 10, 23, 30, 0); // 23h30 aujourd’hui
  const pickedDate = new Date(2026, 5, 11); // demain (picker date : heure/minute non significatives)
  const pickedTime = new Date(2000, 0, 1, 9, 0, 0); // 9h00 (picker heure : jour non significatif)
  const afterDate = withLocalDate(now, pickedDate);
  const reminder = withLocalTime(afterDate, pickedTime);
  check('jour = demain (11), heure = 9h00', reminder.getDate() === 11 && reminder.getHours() === 9 && reminder.getMinutes() === 0, reminder.toString());
  check('reconnu comme futur malgré une heure actuelle tardive (23h30)', isFutureReminder(reminder, now));
}

console.log('\n[3] Passage de jour (fin de mois) → composants locaux corrects, pas de UTC-shift');
{
  const base = new Date(2026, 0, 31, 22, 0, 0); // 31 janvier 22h
  const pickedDate = new Date(2026, 1, 1); // 1er février choisi dans le picker date
  const reminder = withLocalDate(base, pickedDate);
  check('mois/jour mis à jour (1er février), heure conservée (22h)', reminder.getMonth() === 1 && reminder.getDate() === 1 && reminder.getHours() === 22, reminder.toString());
}

console.log('\n[4] Changement d’heure DST Europe/Paris (29 mars 2026, 02h→03h) — composants locaux respectés');
{
  // TZ=Europe/Paris nécessaire pour que ce cas traverse un vrai changement d'heure sur ce fuseau.
  const pickedDate = new Date(2026, 2, 29); // jour du changement d'heure
  const pickedTime = new Date(2000, 0, 1, 9, 0, 0); // 9h00, après le saut d'heure (pas ambigu)
  const reminder = fromLocalDateTimeParts({
    ...toLocalDateTimeParts(withLocalDate(new Date(2026, 2, 1), pickedDate)),
    ...{ hour: pickedTime.getHours(), minute: pickedTime.getMinutes() },
  });
  check('date correcte (29 mars)', reminder.getFullYear() === 2026 && reminder.getMonth() === 2 && reminder.getDate() === 29, reminder.toString());
  check('heure correcte (9h00 locale), pas décalée par le changement d’heure', reminder.getHours() === 9 && reminder.getMinutes() === 0, reminder.toString());
}

console.log('\n[5] Rappel réellement passé → refusé');
{
  const now = new Date(2026, 5, 10, 14, 0, 0);
  const pastReminder = new Date(2026, 5, 10, 13, 59, 0); // 1 min avant "now"
  check('non reconnu comme futur', !isFutureReminder(pastReminder, now));
}

console.log('\n[6] withLocalDate/withLocalTime ne modifient jamais l’autre moitié (jour vs heure indépendants)');
{
  const base = new Date(2026, 5, 10, 9, 30, 0);
  const onlyDateChanged = withLocalDate(base, new Date(2026, 5, 15));
  check('heure inchangée après un changement de date seul', onlyDateChanged.getHours() === 9 && onlyDateChanged.getMinutes() === 30, onlyDateChanged.toString());
  const onlyTimeChanged = withLocalTime(base, new Date(2000, 0, 1, 18, 45, 0));
  check('jour inchangé après un changement d’heure seul', onlyTimeChanged.getDate() === 10 && onlyTimeChanged.getMonth() === 5, onlyTimeChanged.toString());
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
