// CHANTIER "Correctif temporalité III — Event futur protégé d'un rappel épuisé" (2026-09-23) —
// couvre exactement les cas A à I de la consigne dédiée : `isPenseeEnded` (calendar.ts) distingue
// désormais une ancre événementielle réelle (`p.date`) d'un rappel seul (`reminderAt` sans `p.date`)
// — un rappel épuisé ne doit plus jamais terminer prématurément un événement encore futur, tout en
// préservant intégralement Temporalité II (rappel seul, heure-aware, jamais de délai au lendemain) et
// P0 Phase 1 (un rappel encore actif sauve un événement révolu). Pur, sans dépendance react-native —
// mêmes primitives réellement consommées par penseesView.ts/homeAttention.ts.
//
// Usage : npx tsx scripts/test-regression-pensee-event-vs-reminder.ts

import { Pensee, ReminderRecurrence } from '../src/data/types';
import { effectivePenseeAnchorDate, isPenseeEnded, isPenseeActiveOn, penseeAnchor } from '../src/data/calendar';
import { nextPenseeReminderOccurrence } from '../src/data/reminderRecurrence';
import { buildPenseeCards } from '../src/data/penseesView';
import { buildHomeAttentions } from '../src/data/homeAttention';

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
    texte: 'Pensée test event/reminder',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    ...overrides,
  };
}

console.log('\n[A] rappel seul (pas de p.date) passé → ended immédiatement (Temporalité II préservée)');
{
  const p = makePensee({ reminderAt: new Date(2026, 8, 23, 18, 0, 0).toISOString(), reminderRecurrence: null });
  const before = new Date(2026, 8, 23, 17, 59, 0);
  const after = new Date(2026, 8, 23, 18, 1, 0);
  check('avant heure : not ended', isPenseeEnded(p, before) === false);
  check('après heure, LE JOUR MÊME : ended immédiatement', isPenseeEnded(p, after) === true);
}

console.log('\n[B] event futur + reminder one-shot passé → NOT ended (RÉGRESSION Temporalité III corrigée)');
{
  const p = makePensee({ date: '2026-09-28', reminderAt: new Date(2026, 8, 27, 22, 0, 0).toISOString(), reminderRecurrence: null });

  const before = new Date(2026, 8, 27, 21, 59, 0); // 27/09 21:59 — rappel encore actif
  check('27/09 21:59 : isPenseeEnded = false', isPenseeEnded(p, before) === false);
  const beforeCards = buildPenseeCards([p], [], before);
  check('27/09 21:59 : bucket Pensées = today (rappel actif, jour effectif = jour du rappel)', beforeCards[0].bucket === 'today', beforeCards[0].bucket);
  const beforeAttentions = buildHomeAttentions([], [p], before);
  check('27/09 21:59 : présente à l’Accueil', beforeAttentions.some((a) => a.type === 'pensee' && a.id === 'pensee-p1'));

  const afterReminder = new Date(2026, 8, 27, 22, 1, 0); // 27/09 22:01 — rappel épuisé, événement encore futur
  check('27/09 22:01 : isPenseeEnded = false (événement du 28/09 toujours vivant)', isPenseeEnded(p, afterReminder) === false);
  const afterCards = buildPenseeCards([p], [], afterReminder);
  check('27/09 22:01 : bucket Pensées ≠ past', afterCards[0].bucket !== 'past', afterCards[0].bucket);
  const afterAttentions = buildHomeAttentions([], [p], afterReminder);
  check('27/09 22:01 : toujours présente à l’Accueil (pas considérée terminée)', afterAttentions.some((a) => a.type === 'pensee' && a.id === 'pensee-p1'));

  const onEventDay = new Date(2026, 8, 28, 9, 0, 0); // 28/09 — jour de l'événement
  check('28/09 : isPenseeEnded = false (événement toujours actif ce jour)', isPenseeEnded(p, onEventDay) === false);

  const dayAfter = new Date(2026, 8, 29, 9, 0, 0); // 29/09 — événement révolu, aucun rappel actif
  check('29/09 : isPenseeEnded = true (événement révolu, rappel épuisé)', isPenseeEnded(p, dayAfter) === true);
  const dayAfterCards = buildPenseeCards([p], [], dayAfter);
  check('29/09 : bucket = past', dayAfterCards[0].bucket === 'past', dayAfterCards[0].bucket);

  // Non-régression §7 : le Calendrier reste exclusivement basé sur p.date, jamais recouvert.
  check('penseeAnchor (Calendrier) reste ancré sur p.date = 2026-09-28, à tout instant', penseeAnchor(p)?.date === '2026-09-28');
}

console.log('\n[C] event futur + récurrence reminder épuisée → NOT ended (mercredi/vendredi, event dimanche)');
{
  const merVenOnce2: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [3, 5], occurrenceCount: 2, untilDate: null };
  // mercredi 23/09 + vendredi 25/09 = les 2 occurrences ; événement dimanche 27/09 (encore futur après vendredi)
  const p = makePensee({ date: '2026-09-27', reminderAt: new Date(2026, 8, 23, 18, 0, 0).toISOString(), reminderRecurrence: merVenOnce2 });

  const afterFriday = new Date(2026, 8, 25, 18, 1, 0); // vendredi, après la dernière occurrence — série épuisée
  check('vendredi après dernière occurrence : nextPenseeReminderOccurrence = null (série épuisée)', nextPenseeReminderOccurrence(p, afterFriday) === null);
  check('vendredi après dernière occurrence : isPenseeEnded = false (event dimanche encore futur)', isPenseeEnded(p, afterFriday) === false);
  const cards = buildPenseeCards([p], [], afterFriday);
  check('vendredi après dernière occurrence : bucket ≠ past', cards[0].bucket !== 'past', cards[0].bucket);

  const afterSunday = new Date(2026, 8, 28, 9, 0, 0); // lundi 28/09 — événement dimanche révolu, récurrence déjà épuisée
  check('après dimanche : isPenseeEnded = true (event révolu + récurrence épuisée)', isPenseeEnded(p, afterSunday) === true);
  const cardsAfter = buildPenseeCards([p], [], afterSunday);
  check('après dimanche : bucket = past', cardsAfter[0].bucket === 'past', cardsAfter[0].bucket);
}

console.log('\n[D] event passé + reminder futur → NOT ended (non-régression P0 Phase 1)');
{
  const p = makePensee({ date: '2026-09-10', reminderAt: new Date(2026, 8, 25, 9, 0, 0).toISOString(), reminderRecurrence: null });
  const now = new Date(2026, 8, 21, 20, 36, 0); // événement (10/09) déjà passé, rappel (25/09) encore futur
  check('isPenseeEnded = false (rappel futur sauve l’événement révolu)', isPenseeEnded(p, now) === false);
}

console.log('\n[E] event passé + reminder épuisé → ended (préserve P0 Phase 1 côté "épuisé")');
{
  const p = makePensee({ date: '2026-09-10', reminderAt: new Date(2026, 8, 12, 9, 0, 0).toISOString(), reminderRecurrence: null });
  const now = new Date(2026, 8, 21, 20, 36, 0); // événement ET rappel tous deux révolus
  check('isPenseeEnded = true', isPenseeEnded(p, now) === true);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = past', cards[0].bucket === 'past', cards[0].bucket);
}

console.log('\n[F] occurrenceCount=1 sans event → ended le jour même après heure (Temporalité II inchangée)');
{
  const once: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [3, 5, 6], occurrenceCount: 1, untilDate: null };
  const p = makePensee({ reminderAt: new Date(2026, 8, 23, 18, 0, 0).toISOString(), reminderRecurrence: once });
  check('avant heure : not ended', isPenseeEnded(p, new Date(2026, 8, 23, 17, 59, 0)) === false);
  check('après heure, LE JOUR MÊME : ended', isPenseeEnded(p, new Date(2026, 8, 23, 18, 1, 0)) === true);
}

console.log('\n[G] occurrenceCount=3 sans event → prochaine occurrence correcte jusqu’à épuisement (Temporalité II inchangée)');
{
  const three: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [3, 5, 6], occurrenceCount: 3, untilDate: null };
  const p = makePensee({ reminderAt: new Date(2026, 8, 23, 18, 0, 0).toISOString(), reminderRecurrence: three });
  const afterMer = new Date(2026, 8, 23, 18, 30, 0);
  check('après mercredi : prochaine = vendredi', nextPenseeReminderOccurrence(p, afterMer)?.getTime() === new Date(2026, 8, 25, 18, 0, 0).getTime());
  check('après mercredi : not ended', isPenseeEnded(p, afterMer) === false);
  const afterVen = new Date(2026, 8, 25, 18, 30, 0);
  check('après vendredi : prochaine = samedi', nextPenseeReminderOccurrence(p, afterVen)?.getTime() === new Date(2026, 8, 26, 18, 0, 0).getTime());
  check('après vendredi : not ended', isPenseeEnded(p, afterVen) === false);
  const afterSam = new Date(2026, 8, 26, 18, 30, 0);
  check('après samedi : épuisée', nextPenseeReminderOccurrence(p, afterSam) === null);
  check('après samedi, LE JOUR MÊME : ended', isPenseeEnded(p, afterSam) === true);
}

console.log('\n[H] event futur sans reminder → comportement historique (civil, inchangé)');
{
  const p = makePensee({ date: '2026-09-28', reminderAt: null, reminderRecurrence: null });
  check('28/09 : not ended (jour de l’événement, actif toute la journée)', isPenseeEnded(p, new Date(2026, 8, 28, 23, 0, 0)) === false);
  check('29/09 : ended (lendemain, comportement civil historique)', isPenseeEnded(p, new Date(2026, 8, 29, 0, 1, 0)) === true);
}

console.log('\n[I] période (endDate) → comportement historique inchangé (jamais un rappel récurrent)');
{
  const p = makePensee({ date: '2026-09-10', endDate: '2026-09-15', reminderAt: null, reminderRecurrence: null });
  check('pendant la période : not ended', isPenseeEnded(p, new Date(2026, 8, 12, 12, 0, 0)) === false);
  check('dernier jour de la période : not ended (actif toute la journée)', isPenseeEnded(p, new Date(2026, 8, 15, 23, 0, 0)) === false);
  check('lendemain de la période : ended', isPenseeEnded(p, new Date(2026, 8, 16, 0, 1, 0)) === true);
}

console.log('\n[Non-régression] isPenseeActiveOn conserve le court-circuit isPenseeEnded ajouté par Temporalité II');
{
  const p = makePensee({ date: '2026-09-28', reminderAt: new Date(2026, 8, 27, 22, 0, 0).toISOString(), reminderRecurrence: null });
  const afterReminder = new Date(2026, 8, 27, 22, 1, 0);
  check('event futur + rappel épuisé : isPenseeActiveOn reste cohérent avec isPenseeEnded=false (pas de false négatif)', isPenseeActiveOn(p, afterReminder) === (effectivePenseeAnchorDate(p, afterReminder) === '2026-09-27'));
}

console.log('\n[Non-régression] effectivePenseeAnchorDate / penseeAnchor / notificationPlanning non modifiés par ce chantier');
{
  const fs = require('fs');
  const path = require('path');
  const calendarSrc: string = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'calendar.ts'), 'utf8');
  check('effectivePenseeAnchorDate conserve sa signature/logique d’origine (délègue à nextPenseeReminderOccurrence, fallback anchor.date)', /const next = nextPenseeReminderOccurrence\(p, now\);\s*\n\s*return next \? dIso\(next\) : anchor\.date;/.test(calendarSrc));
  check('penseeAnchor conserve sa logique d’origine (priorité p.date, fallback reminderAt)', /if \(p\.date\) return \{ date: p\.date, endDate: p\.endDate \?\? null \};/.test(calendarSrc));
  const notifPlanningSrc: string = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'notificationPlanning.ts'), 'utf8');
  check('notificationPlanning.ts ne référence aucun mécanisme de ce chantier', !notifPlanningSrc.includes('Correctif temporalité III'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
