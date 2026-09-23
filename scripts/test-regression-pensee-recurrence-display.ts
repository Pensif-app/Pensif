// Tests de non-régression — CHANTIER "P0 Récurrence Phase 1" (2026-09-21) — corrige BUG A/B/D :
// une pensée récurrente (reminderRecurrence) dont la 1ère occurrence historique (reminderAt) est
// révolue ne doit plus être classée "passée" (Pensées) ni disparaître de l'Accueil, tant qu'une
// occurrence future existe. Couvre exactement les cas requis par la consigne §7 (daily/weekly,
// infini/fini, actif/épuisé, ponctuel futur/passé) + le cas combiné §6 (date événement + reminderAt
// + reminderRecurrence). Pur, sans dépendance réseau/IA/react-native — utilise directement
// nextPenseeReminderOccurrence (reminderRecurrence.ts) et isPenseeEnded/effectivePenseeAnchorDate
// (calendar.ts), les mêmes fonctions réellement consommées par penseesView.ts/homeAttention.ts.
// Ne teste PAS le scheduler de notification natif (voir instrumentation DEV séparée, hors périmètre
// d'un test pur — nécessite un appareil réel).
//
// Usage : npx tsx scripts/test-regression-pensee-recurrence-display.ts

import { Pensee, ReminderRecurrence } from '../src/data/types';
import { effectivePenseeAnchorDate, isPenseeEnded, penseeAnchor } from '../src/data/calendar';
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
    texte: 'Faire mes combats sur Star Wars',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    ...overrides,
  };
}

const dailyInfinite: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
const weeklyInfinite: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1], occurrenceCount: null, untilDate: null }; // lundi
const dailyFinite5 = (from: Date): ReminderRecurrence => ({ frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null });
const weeklyFiniteUntil: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1], occurrenceCount: null, untilDate: '2026-09-21' };

console.log('\n[1] Cas réel du bug — daily infini, avant l’occurrence du jour → today (CORRECTIF Phase 6 : la prochaine occurrence tombe encore aujourd’hui)');
{
  // reminderAt = 20/09/2026 21:40, now = 21/09/2026 20:36 (avant 21:40)
  const reminderAt = new Date(2026, 8, 20, 21, 40, 0).toISOString();
  const p = makePensee({ reminderAt, reminderRecurrence: dailyInfinite });
  const now = new Date(2026, 8, 21, 20, 36, 0);
  check('isPenseeEnded = false (BUG A corrigé)', isPenseeEnded(p, now) === false);
  const cards = buildPenseeCards([p], [], now);
  // CORRECTIF "Post-TestFlight Phase 6 — P0 Récurrences bucket" (2026-09-23) : avant cette passe,
  // isPenseeActiveOn comparait à l'ancre BRUTE (20/09) au lieu de la prochaine occurrence effective
  // (21/09 21:40, pas encore sonnée à 20:36) — donnait 'upcoming' à tort. La prochaine occurrence
  // tombant aujourd'hui (21/09), le bucket correct est désormais 'today'.
  check('bucket = today', cards[0].bucket === 'today', cards[0].bucket);
  check('reminderLabel = "Rappel 21h40" (pas de jour préfixé)', cards[0].reminderLabel === 'Rappel 21h40', cards[0].reminderLabel ?? 'null');
  const attentions = buildHomeAttentions([], [p], now);
  check('apparaît dans Accueil (BUG B corrigé)', attentions.some((a) => a.type === 'pensee' && a.id === 'pensee-p1'));
}

console.log('\n[2] daily infini, après l’occurrence du jour → prochaine occurrence demain, upcoming');
{
  const reminderAt = new Date(2026, 8, 20, 21, 40, 0).toISOString();
  const p = makePensee({ reminderAt, reminderRecurrence: dailyInfinite });
  const now = new Date(2026, 8, 21, 22, 0, 0); // après 21:40
  const next = nextPenseeReminderOccurrence(p, now);
  check('prochaine occurrence = 22/09/2026 21:40', next?.getTime() === new Date(2026, 8, 22, 21, 40, 0).getTime(), next?.toString());
  check('isPenseeEnded = false', isPenseeEnded(p, now) === false);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = upcoming', cards[0].bucket === 'upcoming', cards[0].bucket);
}

console.log('\n[2bis] weekly mercredi+vendredi — avant l’occurrence de mercredi → today (CORRECTIF Phase 6, cas exact du smoke test)');
{
  // mercredi 2026-09-23, vendredi 2026-09-25 (daysOfWeek: 3=mercredi, 5=vendredi, convention JS getDay())
  const weeklyMerVen: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [3, 5], occurrenceCount: null, untilDate: null };
  const reminderAt = new Date(2026, 8, 16, 18, 0, 0).toISOString(); // ancre historique, mercredi 16/09, 18h
  const p = makePensee({ reminderAt, reminderRecurrence: weeklyMerVen });
  const now = new Date(2026, 8, 23, 17, 0, 0); // mercredi 23/09, avant 18h
  const cards = buildPenseeCards([p], [], now);
  check('bucket = today (occurrence de mercredi encore à venir)', cards[0].bucket === 'today', cards[0].bucket);
}

console.log('\n[2ter] weekly mercredi+vendredi — après l’occurrence de mercredi → upcoming vendredi (CORRECTIF Phase 6, cas exact du smoke test)');
{
  const weeklyMerVen: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [3, 5], occurrenceCount: null, untilDate: null };
  const reminderAt = new Date(2026, 8, 16, 18, 0, 0).toISOString();
  const p = makePensee({ reminderAt, reminderRecurrence: weeklyMerVen });
  const now = new Date(2026, 8, 23, 19, 0, 0); // mercredi 23/09, après 18h (notification reçue)
  const cards = buildPenseeCards([p], [], now);
  check('bucket = upcoming (mercredi sonné, prochaine = vendredi 25/09)', cards[0].bucket === 'upcoming', cards[0].bucket);
  check('jour effectif = vendredi 25/09', cards[0].pensee && effectivePenseeAnchorDate(p, now) === '2026-09-25', effectivePenseeAnchorDate(p, now) ?? 'null');

  // Cohérence Home/Pensées — même prochaine occurrence des deux côtés (consigne §1 "Vérifier sur
  // Pensées ET Accueil").
  const attentions = buildHomeAttentions([], [p], now);
  const homeAttention = attentions.find((a) => a.type === 'pensee' && a.id === 'pensee-p1');
  check('apparaît dans Accueil avec horizon "week" (vendredi, dans la fenêtre 7 jours)', homeAttention?.horizon === 'week', homeAttention?.horizon ?? 'absent');
  check('Home affiche la même date effective que Pensées (vendredi 25/09)', homeAttention?.date === '2026-09-25', homeAttention?.date ?? 'absent');
  check('Home reminderLabel = "Rappel 18h" (même prochaine occurrence que Pensées)', homeAttention?.reminderLabel === 'Rappel 18h', homeAttention?.reminderLabel ?? 'null');
}

console.log('\n[3] weekly infini (lundi), entre deux occurrences → upcoming');
{
  const reminderAt = new Date(2026, 8, 21, 21, 40, 0).toISOString(); // 21/09/2026 = lundi
  const p = makePensee({ reminderAt, reminderRecurrence: weeklyInfinite });
  const now = new Date(2026, 8, 23, 12, 0, 0); // mercredi suivant, entre les deux lundis
  check('isPenseeEnded = false', isPenseeEnded(p, now) === false);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = upcoming', cards[0].bucket === 'upcoming', cards[0].bucket);
  const next = nextPenseeReminderOccurrence(p, now);
  check('prochaine occurrence = lundi suivant (28/09/2026)', next?.getTime() === new Date(2026, 8, 28, 21, 40, 0).getTime(), next?.toString());
}

console.log('\n[4] daily fini, encore active, occurrence du jour pas encore sonnée → today (CORRECTIF Phase 6)');
{
  const reminderAt = new Date(2026, 8, 18, 21, 40, 0).toISOString(); // 5 occurrences à partir du 18/09
  const p = makePensee({ reminderAt, reminderRecurrence: dailyFinite5(new Date()) });
  const now = new Date(2026, 8, 21, 20, 36, 0); // 4e jour de la série (21/09), pas encore sonnée (20:36 < 21:40)
  check('isPenseeEnded = false', isPenseeEnded(p, now) === false);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = today (occurrence du 21/09 encore à venir aujourd’hui)', cards[0].bucket === 'today', cards[0].bucket);
}

console.log('\n[4bis] daily fini, encore active, occurrence du jour déjà sonnée → upcoming demain (CORRECTIF Phase 6)');
{
  const reminderAt = new Date(2026, 8, 18, 21, 40, 0).toISOString();
  const p = makePensee({ reminderAt, reminderRecurrence: dailyFinite5(new Date()) });
  const now = new Date(2026, 8, 21, 22, 0, 0); // même jour, APRÈS 21:40
  check('isPenseeEnded = false', isPenseeEnded(p, now) === false);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = upcoming (prochaine occurrence = 22/09)', cards[0].bucket === 'upcoming', cards[0].bucket);
}

console.log('\n[5] daily fini, épuisée → past');
{
  const reminderAt = new Date(2026, 8, 18, 21, 40, 0).toISOString();
  const p = makePensee({ reminderAt, reminderRecurrence: dailyFinite5(new Date()) }); // 18,19,20,21,22 → épuisée après le 22
  const now = new Date(2026, 8, 25, 20, 36, 0);
  check('isPenseeEnded = true (règle épuisée, aucune occurrence future)', isPenseeEnded(p, now) === true);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = past', cards[0].bucket === 'past', cards[0].bucket);
  const attentions = buildHomeAttentions([], [p], now);
  check('n’apparaît plus dans Accueil (correctement terminée)', !attentions.some((a) => a.type === 'pensee' && a.id === 'pensee-p1'));
}

console.log('\n[6] weekly fini (untilDate atteinte) → past');
{
  const reminderAt = new Date(2026, 8, 14, 21, 40, 0).toISOString(); // lundi 14/09
  const p = makePensee({ reminderAt, reminderRecurrence: weeklyFiniteUntil }); // untilDate = 2026-09-21, dernière occurrence = 21/09
  const now = new Date(2026, 8, 28, 20, 36, 0); // lundi suivant, après untilDate
  check('isPenseeEnded = true', isPenseeEnded(p, now) === true);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = past', cards[0].bucket === 'past', cards[0].bucket);
}

console.log('\n[7] ponctuel (sans récurrence), futur → upcoming (comportement inchangé)');
{
  const reminderAt = new Date(2026, 8, 25, 9, 0, 0).toISOString();
  const p = makePensee({ reminderAt, reminderRecurrence: null });
  const now = new Date(2026, 8, 21, 20, 36, 0);
  check('isPenseeEnded = false', isPenseeEnded(p, now) === false);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = upcoming', cards[0].bucket === 'upcoming', cards[0].bucket);
  check('reminderLabel utilise reminderAt brut (pas de recurrence à recalculer)', cards[0].reminderLabel === 'Rappel 9h', cards[0].reminderLabel ?? 'null');
}

console.log('\n[8] ponctuel (sans récurrence), passé → past (comportement inchangé, non-régression)');
{
  const reminderAt = new Date(2026, 8, 18, 9, 0, 0).toISOString();
  const p = makePensee({ reminderAt, reminderRecurrence: null });
  const now = new Date(2026, 8, 21, 20, 36, 0);
  check('isPenseeEnded = true', isPenseeEnded(p, now) === true);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = past', cards[0].bucket === 'past', cards[0].bucket);
}

console.log('\n[9] Cas combiné §6 — date événement PASSÉE + reminderAt + reminderRecurrence active');
{
  // La sémantique décidée : Calendrier reste piloté par p.date/penseeAnchor SEUL (inchangé) ; le
  // classement Pensées/Accueil/badge tient compte de la récurrence du RAPPEL même si la date de
  // l'ÉVÉNEMENT est révolue — un rappel qui continue de sonner ne doit pas afficher "passé".
  const p = makePensee({
    date: '2026-09-10', // événement déjà passé
    endDate: null,
    reminderAt: new Date(2026, 8, 10, 9, 0, 0).toISOString(),
    reminderRecurrence: dailyInfinite,
  });
  const now = new Date(2026, 8, 21, 20, 36, 0);

  // Calendrier : penseeAnchor() INCHANGÉ, reflète strictement p.date — jamais recouvert.
  check('penseeAnchor (Calendrier) reste ancré sur p.date = 2026-09-10, jamais modifié', penseeAnchor(p)?.date === '2026-09-10');

  // Pensées/Accueil : la récurrence du rappel sauve la pensée du bucket "past" malgré l'événement révolu.
  check('isPenseeEnded = false (le rappel récurrent prime sur l’événement révolu pour ce statut)', isPenseeEnded(p, now) === false);
  // reminderAt = 09h00 : le 21/09 à 20:36, l'occurrence du jour (09h00) est déjà passée — la
  // prochaine occurrence réelle est donc le lendemain (22/09), pas le jour même.
  const effectiveDay = effectivePenseeAnchorDate(p, now);
  check('jour effectif (affichage) = jour de la prochaine occurrence, PAS p.date', effectiveDay === '2026-09-22', effectiveDay ?? 'null');
  const cards = buildPenseeCards([p], [], now);
  check('bucket = upcoming', cards[0].bucket === 'upcoming', cards[0].bucket);
}

console.log('\n[10] Non-régression — pensée memo pure (aucune ancre) : comportement totalement inchangé');
{
  const p = makePensee({ date: null, reminderAt: null, reminderRecurrence: null });
  const now = new Date(2026, 8, 21, 20, 36, 0);
  check('isPenseeEnded = false (aucune ancre)', isPenseeEnded(p, now) === false);
  check('effectivePenseeAnchorDate = null (aucune ancre)', effectivePenseeAnchorDate(p, now) === null);
  const cards = buildPenseeCards([p], [], now);
  check('bucket = memo', cards[0].bucket === 'memo', cards[0].bucket);
  check('reminderLabel = null', cards[0].reminderLabel === null);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
