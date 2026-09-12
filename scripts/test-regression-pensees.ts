// Tests de non-régression — CHANTIER ONGLET PENSÉES V1 (regroupement/tri de penseesView.ts, cartes
// Pensées, tap → Calendrier). Lecture seule — aucune donnée n'est modifiée par ce script.
// Assertions dures : lève une exception (code de sortie non-nul) si une régression est détectée.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-pensees.ts

import { Contact, Pensee } from '../src/data/types';
import { buildPenseeCards, groupPenseeCards } from '../src/data/penseesView';
import { navigateToAttention } from '../src/data/homeAttention';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme',
    initials: 'T',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    date: '2026-01-01',
    texte: 'Une pensée',
    remind: '0',
    contactId: null,
    ...overrides,
  };
}

const TODAY = new Date(2026, 0, 15); // 15 janvier 2026, référence fixe

// --- Pensée aujourd'hui → Aujourd'hui -------------------------------------------------------
{
  console.log('\n[1] Pensée ponctuelle datée aujourd’hui → section Aujourd’hui');
  const p = makePensee({ id: 'p-today', date: '2026-01-15' });
  const groups = groupPenseeCards(buildPenseeCards([p], [], TODAY));
  check('dans "today"', groups.today.some((c) => c.id === 'p-today'));
  check('pas dans "upcoming" ni "past"', !groups.upcoming.some((c) => c.id === 'p-today') && !groups.past.some((c) => c.id === 'p-today'));
}

// --- Période englobant aujourd'hui → Aujourd'hui --------------------------------------------
{
  console.log('\n[2] Période englobant aujourd’hui → section Aujourd’hui');
  const p = makePensee({ id: 'p-period-active', date: '2026-01-10', endDate: '2026-01-20' });
  const groups = groupPenseeCards(buildPenseeCards([p], [], TODAY));
  check('dans "today"', groups.today.some((c) => c.id === 'p-period-active'));
}

// --- Pensée demain → À venir ------------------------------------------------------------------
{
  console.log('\n[3] Pensée demain → section À venir');
  const p = makePensee({ id: 'p-tomorrow', date: '2026-01-16' });
  const groups = groupPenseeCards(buildPenseeCards([p], [], TODAY));
  check('dans "upcoming"', groups.upcoming.some((c) => c.id === 'p-tomorrow'));
}

// --- Plusieurs pensées futures → ordre chronologique ascendant --------------------------------
{
  console.log('\n[4] Plusieurs pensées futures → tri chronologique ascendant');
  const p1 = makePensee({ id: 'p-j10', date: '2026-01-25' });
  const p2 = makePensee({ id: 'p-j2', date: '2026-01-17' });
  const p3 = makePensee({ id: 'p-j5', date: '2026-01-20' });
  const groups = groupPenseeCards(buildPenseeCards([p1, p2, p3], [], TODAY));
  check('ordre : j2, j5, j10', groups.upcoming.map((c) => c.id).join(',') === 'p-j2,p-j5,p-j10', groups.upcoming.map((c) => c.id).join(','));
}

// --- Pensée passée → Passées --------------------------------------------------------------------
{
  console.log('\n[5] Pensée ponctuelle passée → section Passées');
  const p = makePensee({ id: 'p-past', date: '2026-01-05' });
  const groups = groupPenseeCards(buildPenseeCards([p], [], TODAY));
  check('dans "past"', groups.past.some((c) => c.id === 'p-past'));
  check('pas exclue (contrairement à l’Accueil qui, lui, l’exclut totalement)', groups.past.length === 1);
}

// --- Période terminée → Passées -----------------------------------------------------------------
{
  console.log('\n[6] Période terminée → section Passées');
  const p = makePensee({ id: 'p-period-ended', date: '2026-01-01', endDate: '2026-01-10' });
  const groups = groupPenseeCards(buildPenseeCards([p], [], TODAY));
  check('dans "past"', groups.past.some((c) => c.id === 'p-period-ended'));
}

// --- Ordre des passées : récente → ancienne ------------------------------------------------------
{
  console.log('\n[7] Passées triées de la plus récente à la plus ancienne');
  const old = makePensee({ id: 'p-old', date: '2025-11-01' });
  const recent = makePensee({ id: 'p-recent', date: '2026-01-13' });
  const mid = makePensee({ id: 'p-mid', date: '2025-12-20' });
  const groups = groupPenseeCards(buildPenseeCards([old, recent, mid], [], TODAY));
  check(
    'ordre : recent, mid, old',
    groups.past.map((c) => c.id).join(',') === 'p-recent,p-mid,p-old',
    groups.past.map((c) => c.id).join(','),
  );
}

// --- Pensée liée à un contact → nom résolu ---------------------------------------------------------
{
  console.log('\n[8] Pensée liée à un contact → nom résolu dans le sous-titre');
  const contact = makeContact({ id: 'c-julie', prenom: 'Julie', nom: 'Martin' });
  const p = makePensee({ id: 'p-linked', date: '2026-01-16', contactId: 'c-julie' });
  const cards = buildPenseeCards([p], [contact], TODAY);
  const card = cards.find((c) => c.id === 'p-linked')!;
  check('le sous-titre contient le nom du proche', card.subtitle.includes('Julie'), card.subtitle);
}

// --- Pensée sans contact → fonctionne -----------------------------------------------------------
{
  console.log('\n[9] Pensée sans contact lié → fonctionne, pas de résidu "undefined"');
  const p = makePensee({ id: 'p-nocontact', date: '2026-01-16', contactId: null });
  const cards = buildPenseeCards([p], [], TODAY);
  const card = cards.find((c) => c.id === 'p-nocontact')!;
  check('sous-titre propre, sans "undefined"/"null"', !card.subtitle.includes('undefined') && !card.subtitle.includes('null'), card.subtitle);
}

// --- Rappel preset → bon libellé -------------------------------------------------------------------
{
  console.log('\n[10] Rappel preset → bon libellé (reminderLabels)');
  const p = makePensee({ id: 'p-preset', date: '2026-01-20', remind: '7' });
  const cards = buildPenseeCards([p], [], TODAY);
  const card = cards.find((c) => c.id === 'p-preset')!;
  check('libellé "1 semaine avant"', card.reminderLabel === 'Rappel 1 semaine avant', card.reminderLabel ?? 'null');
}

// --- Rappel custom → bon libellé --------------------------------------------------------------------
{
  console.log('\n[11] Rappel custom → bon libellé (formatCustomOffset)');
  const p = makePensee({ id: 'p-custom', date: '2026-01-20', remind: 'custom', customOffsetMinutes: 90 });
  const cards = buildPenseeCards([p], [], TODAY);
  const card = cards.find((c) => c.id === 'p-custom')!;
  check('libellé formaté (1h30)', card.reminderLabel === 'Rappel 1 h 30 min avant', card.reminderLabel ?? 'null');
}

// --- Tap pensée → Calendrier + focusDate -------------------------------------------------------------
{
  console.log('\n[12] Tap sur une pensée → Calendrier avec le bon focusDate');
  const calls: { name: string; params?: object }[] = [];
  const navigate = (name: string, params?: object) => calls.push({ name, params });
  navigateToAttention(navigate, { kind: 'calendar', focusDate: '2026-03-01' });
  check('navigate("Tabs", {screen:"Calendrier", params:{focusDate}})', calls.length === 1 && calls[0].name === 'Tabs', JSON.stringify(calls));
  check('focusDate correct', JSON.stringify((calls[0].params as any)?.params) === JSON.stringify({ focusDate: '2026-03-01' }), JSON.stringify(calls[0].params));
}

// --- Cadeaux : navigateToAttention('ideas') navigue directement (plus via Tabs) -----------------------
{
  console.log('\n[bonus] navigateToAttention("ideas") → Cadeaux direct, plus de détour par Tabs');
  const calls: { name: string; params?: object }[] = [];
  const navigate = (name: string, params?: object) => calls.push({ name, params });
  navigateToAttention(navigate, { kind: 'ideas', contactId: 'c-42' });
  check('navigate("Cadeaux", {contactId})', calls.length === 1 && calls[0].name === 'Cadeaux', JSON.stringify(calls));
  check('contactId correct', (calls[0].params as any)?.contactId === 'c-42', JSON.stringify(calls[0].params));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
