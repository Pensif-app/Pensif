// Tests de non-régression — corrige l'affichage Calendrier des pensées ancrées uniquement par
// `reminderAt` (src/data/calendar.ts, penseeAnchor + getDayEvents). Couvre exactement les 5 cas
// demandés : reminderAt seul, date seule, date+reminderAt (date prioritaire), aucune ancre, et le
// cas timezone/minuit (pas de décalage de jour dû à une conversion UTC naïve). Pur, sans
// dépendance réseau/IA/react-native.
//
// Usage : npx tsx scripts/test-regression-calendar-anchor.ts

import { Pensee } from '../src/data/types';
import { penseeAnchor, getDayEvents, isoOf } from '../src/data/calendar';

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

console.log('\n[1] date=null, reminderAt=2026-09-14 08:00 local → anchor = 2026-09-14');
{
  const reminderAt = new Date(2026, 8, 14, 8, 0, 0).toISOString();
  const p = makePensee({ date: null, reminderAt });
  const anchor = penseeAnchor(p);
  check('anchor.date === 2026-09-14', anchor?.date === '2026-09-14', `got ${anchor?.date}`);
  check('anchor.endDate === null (jamais une période)', anchor?.endDate === null);
}

console.log('\n[2] date=2026-09-18, reminderAt=null → anchor = 2026-09-18');
{
  const p = makePensee({ date: '2026-09-18', reminderAt: null });
  const anchor = penseeAnchor(p);
  check('anchor.date === 2026-09-18', anchor?.date === '2026-09-18');
}

console.log('\n[3] date=2026-09-18, reminderAt=2026-09-17 18:00 → anchor = 2026-09-18 (date prioritaire)');
{
  const reminderAt = new Date(2026, 8, 17, 18, 0, 0).toISOString();
  const p = makePensee({ date: '2026-09-18', reminderAt });
  const anchor = penseeAnchor(p);
  check('anchor.date === 2026-09-18 (pas 2026-09-17)', anchor?.date === '2026-09-18', `got ${anchor?.date}`);
}

console.log('\n[4] date=null, reminderAt=null → no anchor');
{
  const p = makePensee({ date: null, reminderAt: null });
  check('anchor === null', penseeAnchor(p) === null);
}

console.log("\n[5] cas minuit/timezone local → pas de décalage de jour (peu importe le fuseau de la machine qui exécute ce test)");
{
  // 00:30 local — c'est exactement le cas où un slice() UTC naïf sur .toISOString() pouvait faire
  // reculer d'un jour selon le fuseau (voir le bug corrigé dans calendar.ts).
  const localMidnight = new Date(2026, 8, 14, 0, 30, 0);
  const reminderAt = localMidnight.toISOString();
  const anchor = penseeAnchor(makePensee({ date: null, reminderAt }));
  check('anchor.date === 2026-09-14 (jour local, pas le jour UTC)', anchor?.date === '2026-09-14', `got ${anchor?.date}`);

  // 23:45 local aussi, pour couvrir le sens inverse (UTC pourrait avancer d'un jour selon le fuseau).
  const lateLocal = new Date(2026, 8, 14, 23, 45, 0);
  const anchor2 = penseeAnchor(makePensee({ date: null, reminderAt: lateLocal.toISOString() }));
  check('23:45 local → toujours 2026-09-14', anchor2?.date === '2026-09-14', `got ${anchor2?.date}`);
}

console.log('\n[getDayEvents] "Appeler Mickael à 8h demain" (reminderAt seul) apparaît bien dans le Calendrier au bon jour');
{
  const reminderAt = new Date(2026, 8, 14, 8, 0, 0).toISOString();
  const p = makePensee({ id: 'p-reminder', texte: 'Appeler Mickael', date: null, reminderAt });
  const eventsOnDay = getDayEvents(2026, 8, 14, [], [p], new Date(2026, 8, 13));
  const eventsOnWrongDay = getDayEvents(2026, 8, 13, [], [p], new Date(2026, 8, 13));
  check('visible le 14 septembre (jour du rappel)', eventsOnDay.some((e) => e.penseeId === 'p-reminder'));
  check('absente le 13 septembre (pas de fuite sur le jour voisin)', !eventsOnWrongDay.some((e) => e.penseeId === 'p-reminder'));
}

console.log('\n[getDayEvents] date+reminderAt sur des jours différents → visible au jour de `date`, jamais déplacée au jour du rappel');
{
  // date = vendredi 2026-09-18, reminderAt = jeudi 2026-09-17 18:00
  const reminderAt = new Date(2026, 8, 17, 18, 0, 0).toISOString();
  const p = makePensee({ id: 'p-mixed', texte: 'Anniversaire Sofia', date: '2026-09-18', reminderAt });
  const onFriday = getDayEvents(2026, 8, 18, [], [p], new Date(2026, 8, 10));
  const onThursday = getDayEvents(2026, 8, 17, [], [p], new Date(2026, 8, 10));
  check('visible vendredi (jour de `date`)', onFriday.some((e) => e.penseeId === 'p-mixed'));
  check('absente jeudi (le rappel ne déplace jamais l’ancre)', !onThursday.some((e) => e.penseeId === 'p-mixed'));
}

console.log('\n[getDayEvents] aucune ancre → jamais dans le Calendrier, aucun jour');
{
  const p = makePensee({ id: 'p-none', texte: 'Micka aime le café', date: null, reminderAt: null });
  const iso = isoOf(2026, 8, 14);
  const events = getDayEvents(2026, 8, 14, [], [p], new Date(2026, 8, 10));
  check(`absente le ${iso}`, !events.some((e) => e.penseeId === 'p-none'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
