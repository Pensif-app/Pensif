// Tests de non-régression — CHANTIER ACCUEIL V1 (nouvelle structure d'attentions Accueil : horizons
// today/week/later, pensées filtrées par vraie date, giftPreparedYear lié à l'occurrence annuelle,
// fêtes de prénom/familiales limitées aux proches réels, jours fériés génériques absents). Assertions
// dures : lève une exception (donc code de sortie non-nul) si une régression est détectée. Lecture
// seule — aucune donnée n'est modifiée par ce script.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-home.ts

import { Contact, Pensee } from '../src/data/types';
import { buildHomeAttentions, HomeAttention } from '../src/data/homeAttention';
import { occurrenceYear, familyFetes } from '../src/data/calendar';

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
    quiz: { answers: [], interests: [], avoid: [], wish: '', completedAt: new Date().toISOString(), budget: null, themeAnswers: {}, feedback: [], recommendationHistory: [] },
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
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    ...overrides,
  };
}

function find(list: HomeAttention[], id: string): HomeAttention | undefined {
  return list.find((a) => a.id === id);
}

const TODAY = new Date(2026, 0, 15); // 15 janvier 2026, référence fixe pour des tests déterministes

// --- Anniversaire aujourd'hui -----------------------------------------------------------------
{
  console.log('\n[1] Anniversaire aujourd’hui');
  const c = makeContact({ id: 'a-today', prenom: 'Aujourdhui', date: '1990-01-15' });
  const list = buildHomeAttentions([c], [], TODAY);
  const a = find(list, 'anniv-a-today');
  check('présent', !!a);
  check('horizon = today', a?.horizon === 'today', a?.horizon);
  check('daysUntil = 0', a?.daysUntil === 0);
  check('action = message (jour J, jamais le quiz)', a?.action.kind === 'message', a?.action.kind);
}

// --- Anniversaires J+3, J+20, J+61 ---------------------------------------------------------------
{
  console.log('\n[2] Anniversaires J+3 / J+20 / J+61');
  const c3 = makeContact({ id: 'a-j3', prenom: 'J3', date: '1990-01-18' });
  const c20 = makeContact({ id: 'a-j20', prenom: 'J20', date: '1990-02-04' });
  const c61 = makeContact({ id: 'a-j61', prenom: 'J61', date: '1990-03-17' });
  const list = buildHomeAttentions([c3, c20, c61], [], TODAY);
  const a3 = find(list, 'anniv-a-j3');
  const a20 = find(list, 'anniv-a-j20');
  const a61 = find(list, 'anniv-a-j61');
  check('J+3 présent, horizon week', a3?.daysUntil === 3 && a3?.horizon === 'week', `${a3?.daysUntil}/${a3?.horizon}`);
  check('J+20 présent, horizon later', a20?.daysUntil === 20 && a20?.horizon === 'later', `${a20?.daysUntil}/${a20?.horizon}`);
  check('J+61 absent (hors fenêtre 60 jours)', a61 === undefined);
}

// --- Plusieurs anniversaires le même jour ---------------------------------------------------------
{
  console.log('\n[3] Plusieurs anniversaires le même jour');
  const c1 = makeContact({ id: 'a-multi-1', prenom: 'Multi1', date: '1990-01-15' });
  const c2 = makeContact({ id: 'a-multi-2', prenom: 'Multi2', date: '1985-01-15' });
  const list = buildHomeAttentions([c1, c2], [], TODAY);
  const todays = list.filter((a) => a.horizon === 'today' && a.type === 'anniversaire');
  check('les deux anniversaires apparaissent', todays.length === 2, `${todays.length}`);
}

// --- Pensée passée : ne doit plus apparaître ------------------------------------------------------
{
  console.log('\n[4] Pensée passée');
  const p = makePensee({ id: 'p-past', date: '2026-01-10' });
  const list = buildHomeAttentions([], [p], TODAY);
  check('absente', find(list, 'pensee-p-past') === undefined);
}

// --- Pensée aujourd'hui ---------------------------------------------------------------------------
{
  console.log('\n[5] Pensée aujourd’hui');
  const p = makePensee({ id: 'p-today', date: '2026-01-15' });
  const list = buildHomeAttentions([], [p], TODAY);
  const a = find(list, 'pensee-p-today');
  check('présente, horizon today, daysUntil 0', a?.horizon === 'today' && a?.daysUntil === 0, `${a?.horizon}/${a?.daysUntil}`);
}

// --- Pensée J+4 -------------------------------------------------------------------------------------
{
  console.log('\n[6] Pensée J+4');
  const p = makePensee({ id: 'p-j4', date: '2026-01-19' });
  const list = buildHomeAttentions([], [p], TODAY);
  const a = find(list, 'pensee-p-j4');
  check('présente, horizon week, daysUntil 4', a?.horizon === 'week' && a?.daysUntil === 4, `${a?.horizon}/${a?.daysUntil}`);
  // CHANTIER NAVIGATION ACCUEIL PENSÉES V2 : un tap sur cette carte doit ouvrir PenseeDetailScreen
  // (même variant que le tap sur notification), plus jamais le Calendrier via focusDate.
  check(
    'action = pensee-detail avec le bon penseeId (plus "calendar")',
    a?.action.kind === 'pensee-detail' && (a.action as any).penseeId === 'p-j4',
    JSON.stringify(a?.action),
  );
}

// --- Pensée de période contenant aujourd'hui --------------------------------------------------------
{
  console.log('\n[7] Pensée de période contenant aujourd’hui');
  const p = makePensee({ id: 'p-period-active', date: '2026-01-10', endDate: '2026-01-20' });
  const list = buildHomeAttentions([], [p], TODAY);
  const a = find(list, 'pensee-p-period-active');
  check('active, horizon today, daysUntil 0', a?.horizon === 'today' && a?.daysUntil === 0, `${a?.horizon}/${a?.daysUntil}`);
  check(
    'action = pensee-detail même pour une pensée de période',
    a?.action.kind === 'pensee-detail' && (a.action as any).penseeId === 'p-period-active',
    JSON.stringify(a?.action),
  );

  // Une période déjà terminée doit disparaître, comme une pensée ponctuelle passée.
  const pEnded = makePensee({ id: 'p-period-ended', date: '2026-01-01', endDate: '2026-01-10' });
  const list2 = buildHomeAttentions([], [pEnded], TODAY);
  check('période terminée absente', find(list2, 'pensee-p-period-ended') === undefined);
}

// --- Fête de prénom : avec et sans contact correspondant --------------------------------------------
{
  console.log('\n[8] Fête de prénom (namedayTable: lea → 03-22)');
  const todayNearLea = new Date(2026, 2, 20); // 20 mars, J-2 avant la fête de Léa (22 mars)
  const withMatch = makeContact({ id: 'a-lea', prenom: 'Léa', date: '2000-06-01' });
  const withoutMatch = makeContact({ id: 'a-zzz', prenom: 'Zzzephyrin', date: '2000-06-01' });

  const listMatch = buildHomeAttentions([withMatch], [], todayNearLea);
  check('fête de prénom générée pour un prénom qui correspond', !!find(listMatch, 'fete-prenom-a-lea'));

  const listNoMatch = buildHomeAttentions([withoutMatch], [], todayNearLea);
  check('aucune fête de prénom générée pour un prénom qui ne correspond à rien', find(listNoMatch, 'fete-prenom-a-zzz') === undefined);
  check(
    'aucune fête de prénom générique (les 14 prénoms de la table) sans contact correspondant',
    listNoMatch.filter((a) => a.type === 'fete-prenom').length === 0,
  );
}

// --- Fête familiale avec relation correspondante ------------------------------------------------------
{
  console.log('\n[9] Fête familiale (Fête des Mères)');
  const meresIso = Object.entries(familyFetes(2026)).find(([, label]) => label === 'Fête des Mères')![0];
  const [y, m, d] = meresIso.split('-').map(Number);
  const todayBeforeMeres = new Date(y, m - 1, d - 2); // J-2 avant la Fête des Mères réelle de 2026

  const mere = makeContact({ id: 'a-mere', prenom: 'Maman', date: '1960-01-01', familyRole: 'Mère' });
  const pere = makeContact({ id: 'a-pere', prenom: 'Papa', date: '1960-01-01', familyRole: 'Père' });

  const list = buildHomeAttentions([mere, pere], [], todayBeforeMeres);
  check('fête familiale générée pour le proche dont familyRole correspond (Mère)', !!find(list, `fete-familiale-a-mere-${meresIso}`));
  check(
    'aucune fête familiale générée pour un proche dont familyRole ne correspond pas (Père, un jour de Fête des Mères)',
    list.filter((a) => a.type === 'fete-familiale' && a.contactId === 'a-pere').length === 0,
  );
}

// --- Jour férié générique absent de l'Accueil ----------------------------------------------------------
{
  console.log('\n[10] Jour férié générique (Fête du Travail, 1er mai) absent de l’Accueil');
  const mayFirst = new Date(2026, 4, 1);
  const list = buildHomeAttentions([], [], mayFirst);
  check('aucune attention générée (aucun contact/pensée, jour férié seul ne suffit pas)', list.length === 0, `${list.length} attention(s)`);
}

// --- Cadeau préparé en 2026, puis anniversaire 2027 → redevient non préparé ------------------------------
{
  console.log('\n[11] giftPreparedYear lié à l’occurrence annuelle');
  const c = makeContact({
    id: 'a-annuel',
    prenom: 'Annuel',
    date: '1990-01-15',
    giftPreparedYear: 2026,
    birthdayReminderDays: 7, // alerte déjà réglée, pour isoler le test sur giftPreparedYear seul
    quiz: { answers: [], interests: [], avoid: [], wish: '', completedAt: new Date().toISOString(), budget: null, themeAnswers: {}, feedback: [], recommendationHistory: [] },
  });

  const before2026Birthday = new Date(2026, 0, 10); // avant l'anniversaire 2026 : occurrence = 2026
  check('occurrenceYear = 2026 avant l’anniversaire 2026', occurrenceYear(c.date, before2026Birthday) === 2026);
  const listPrepared = buildHomeAttentions([c], [], before2026Birthday);
  const aPrepared = find(listPrepared, 'anniv-a-annuel');
  check('badge "Tout est prêt" tant que giftPreparedYear correspond à l’occurrence en cours', aPrepared?.badge?.label === 'Tout est prêt', aPrepared?.badge?.label);

  const before2027Birthday = new Date(2027, 0, 1); // 14 jours avant l'anniversaire 2027 : occurrence = 2027, différente de giftPreparedYear=2026
  check('occurrenceYear = 2027 avant l’anniversaire 2027', occurrenceYear(c.date, before2027Birthday) === 2027);
  const listNextYear = buildHomeAttentions([c], [], before2027Birthday);
  const aNextYear = find(listNextYear, 'anniv-a-annuel');
  check(
    'redevient "non préparé" (giftPreparedYear=2026 ≠ occurrence 2027) → Voir les idées',
    aNextYear?.badge?.label === 'Voir les idées',
    aNextYear?.badge?.label,
  );
}

// --- Complément : proximité du jour J ne bloque jamais sur le quiz --------------------------------------
{
  console.log('\n[bonus] Très proche de l’anniversaire (J+2) sans quiz fait → “Préparer son message”, pas le quiz');
  const c = makeContact({ id: 'a-close', prenom: 'Proche', date: '1990-01-17', quiz: null });
  const list = buildHomeAttentions([c], [], TODAY);
  const a = find(list, 'anniv-a-close');
  check('CTA = préparer le message, pas le quiz', a?.action.kind === 'message' && a?.badge?.label === 'Préparer son message', `${a?.action.kind}/${a?.badge?.label}`);
}

// --- VALIDATION MANUELLE iPhone (2026-09-16) : libellé du badge "jour J" rendu plus explicite -----
{
  console.log('\n[bonus 2] Anniversaire le jour J → badge "Envoyer un message" (plus explicite que l’ancien "Aujourd\'hui"), même action');
  const c = makeContact({ id: 'a-today', prenom: 'JourJ', date: `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}` });
  const list = buildHomeAttentions([c], [], TODAY);
  const a = find(list, 'anniv-a-today');
  check('badge = "Envoyer un message" le jour J', a?.badge?.label === 'Envoyer un message', a?.badge?.label);
  check('action inchangée : toujours "message" (pas de changement de logique, texte seul)', a?.action.kind === 'message');
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
