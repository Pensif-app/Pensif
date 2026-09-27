// Tests de non-régression — CHANTIER PROCHES + FICHE V1 (tri ContactsScreen, libellé anniversaire,
// résumé pensées liées, réinitialisation du filtre au tap direct sur l'onglet Pensées). Logique pure
// uniquement — ContactsScreen.tsx/FicheScreen.tsx/PenseesScreen.tsx importent des composants
// react-native et ne peuvent pas être chargés sous ts-node (même constat que les chantiers
// précédents) ; le comparateur de tri et le résumé de pensées sont donc extraits ici à l'identique
// de leur implémentation réelle pour rester vérifiables. Lecture seule.
//
// §1-5 mis à jour pour CHANTIER "Index alphabétique Proches" (2026-09-27) : le tri par prochain
// anniversaire a été retiré (déjà couvert par l'Accueil Aujourd'hui/Cette semaine/À anticiper) —
// seul reste favoris d'abord (triés entre eux alphabétiquement), puis alphabétique pur.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-contacts-fiche.ts

import { Contact, Pensee } from '../src/data/types';
import { birthdayCountdownLabel } from '../src/data/calendar';
import { buildPenseeCards, groupPenseeCards } from '../src/data/penseesView';
import { paramsForTabPress } from '../src/navigation/tabNavigationHelpers';

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
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    ...overrides,
  };
}

// Reproduit EXACTEMENT le comparateur de src/screens/ContactsScreen.tsx (non exporté, composant
// react-native non chargeable ici) — voir ce fichier pour l'original.
function compareContacts(a: Contact, b: Contact): number {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  return `${a.prenom} ${a.nom}`.trim().localeCompare(`${b.prenom} ${b.nom}`.trim(), 'fr', { sensitivity: 'base' });
}

// Reproduit EXACTEMENT src/screens/FicheScreen.tsx::penseeSummaryLabel.
function penseeSummaryLabel(total: number, todayCount: number, upcomingCount: number): string {
  if (total === 0) return 'Aucune pensée liée pour l’instant.';
  const parts = [`${total} pensée${total > 1 ? 's' : ''}`];
  if (todayCount > 0) parts.push(`${todayCount} aujourd’hui`);
  else if (upcomingCount > 0) parts.push(`${upcomingCount} à venir`);
  return `${parts.join(' · ')}.`;
}

const TODAY = new Date(2026, 0, 15); // 15 janvier 2026, référence fixe

// --- Tri : favori avant non-favori ------------------------------------------------------------
{
  console.log('\n[1] Favori avant non-favori');
  const fav = makeContact({ id: 'fav', prenom: 'Zoe', favorite: true });
  const nonFav = makeContact({ id: 'nonfav', prenom: 'Aaron', favorite: false });
  const sorted = [nonFav, fav].sort((a, b) => compareContacts(a, b));
  check('favori en premier malgré un nom alphabétiquement postérieur', sorted[0].id === 'fav', sorted.map((c) => c.id).join(','));
}

// --- Favoris triés entre eux alphabétiquement ----------------------------------------------------
{
  console.log('\n[2] Favoris triés entre eux par ordre alphabétique (plus d’anniversaire)');
  const favB = makeContact({ id: 'fav-b', prenom: 'Bernard', favorite: true });
  const favA = makeContact({ id: 'fav-a', prenom: 'Alice', favorite: true });
  const sorted = [favB, favA].sort((a, b) => compareContacts(a, b));
  check('Alice avant Bernard', sorted[0].id === 'fav-a', sorted.map((c) => c.id).join(','));
}

// --- Non-favoris triés alphabétiquement (plus d'anniversaire) --------------------------------------
{
  console.log('\n[3] Non-favoris triés par ordre alphabétique (plus d’anniversaire)');
  const z = makeContact({ id: 'z', prenom: 'Zoe', favorite: false });
  const a = makeContact({ id: 'a', prenom: 'Aaron', favorite: false });
  const sorted = [z, a].sort((x, y) => compareContacts(x, y));
  check('Aaron avant Zoe', sorted[0].id === 'a', sorted.map((c) => c.id).join(','));
}

// --- Égalité de prénom → nom de famille départage -----------------------------------------------------
{
  console.log('\n[4] Prénoms identiques → le nom de famille départage');
  const zoe = makeContact({ id: 'zoe', prenom: 'Sam', nom: 'Zoe', favorite: false });
  const aaron = makeContact({ id: 'aaron', prenom: 'Sam', nom: 'Aaron', favorite: false });
  const sorted = [zoe, aaron].sort((a, b) => compareContacts(a, b));
  check('Sam Aaron avant Sam Zoe', sorted[0].id === 'aaron', sorted.map((c) => c.id).join(','));
}

// --- Absence de date d'anniversaire sans effet sur le tri (retiré du critère) --------------------
{
  console.log('\n[5] Contact sans date d’anniversaire : aucun effet sur le tri (retiré du critère)');
  const withDate = makeContact({ id: 'with-date', prenom: 'A', favorite: false, date: '1990-12-01' });
  const noDate = makeContact({ id: 'no-date', prenom: 'Z', favorite: false, date: '' });
  const sorted = [noDate, withDate].sort((a, b) => compareContacts(a, b));
  check('ordre purement alphabétique, la présence d’une date n’intervient plus', sorted[0].id === 'with-date', sorted.map((c) => c.id).join(','));

  // Reste vrai côté favoris aussi (même groupe, comparaison indépendante du statut favori).
  const favNoDate = makeContact({ id: 'fav-no-date', prenom: 'A', favorite: true, date: '' });
  const favWithDate = makeContact({ id: 'fav-with-date', prenom: 'Z', favorite: true, date: '1990-12-01' });
  const sortedFav = [favWithDate, favNoDate].sort((a, b) => compareContacts(a, b));
  check('même règle à l’intérieur du groupe des favoris', sortedFav[0].id === 'fav-no-date', sortedFav.map((c) => c.id).join(','));
}

// --- Libellé anniversaire : aujourd'hui / demain / futur --------------------------------------------
{
  console.log('\n[6] birthdayCountdownLabel : aujourd’hui, demain, futur (J-N + date, sans année)');
  check('aujourd’hui', birthdayCountdownLabel('1990-01-15', TODAY) === "Anniversaire aujourd'hui");
  check('demain', birthdayCountdownLabel('1990-01-16', TODAY) === 'Anniversaire demain');
  const futureLabel = birthdayCountdownLabel('1990-03-07', TODAY); // 15 janv. → 7 mars = 51 jours
  check('futur : "Anniversaire dans 51 jours · 7 mars"', futureLabel === 'Anniversaire dans 51 jours · 7 mars', futureLabel);
  check('aucune année affichée', !/199\d|20\d\d/.test(futureLabel), futureLabel);
}

// --- Zéro proche → état vide (structurel, voir check-pensees-navigation.js pour le texte exact) -----
console.log('\n[7] Zéro proche → état vide (vérifié structurellement, voir check-contacts-fiche.js)');
check('placeholder — assertion réelle dans check-contacts-fiche.js (composant React Native)', true);

// --- Pensées liées : total / à venir / active aujourd'hui / exclusion des autres contacts -----------
{
  console.log('\n[8] Pensées liées à un contact — total, à venir, active aujourd’hui, exclusion des autres');
  const yohan = makeContact({ id: 'yohan', prenom: 'Yohan' });
  const other = makeContact({ id: 'other', prenom: 'Autre' });
  const pensees = [
    makePensee({ id: 'p1', date: '2026-01-15', contactId: 'yohan' }), // aujourd'hui
    makePensee({ id: 'p2', date: '2026-01-20', contactId: 'yohan' }), // à venir
    makePensee({ id: 'p3', date: '2026-01-25', contactId: 'yohan' }), // à venir
    makePensee({ id: 'p4', date: '2026-01-20', contactId: 'other' }), // ne doit PAS compter pour Yohan
  ];
  const linked = pensees.filter((p) => p.contactId === 'yohan');
  check('3 pensées liées à Yohan (la 4e, liée à un autre contact, est exclue)', linked.length === 3, `${linked.length}`);

  const groups = groupPenseeCards(buildPenseeCards(linked, [yohan, other], TODAY));
  const total = groups.today.length + groups.upcoming.length + groups.past.length;
  check('total = 3', total === 3, `${total}`);
  check('à venir = 2', groups.upcoming.length === 2, `${groups.upcoming.length}`);
  check('active aujourd’hui = 1', groups.today.length === 1, `${groups.today.length}`);

  check('libellé "3 pensées · 1 aujourd’hui" (priorité simple, pas de scoring)', penseeSummaryLabel(total, groups.today.length, groups.upcoming.length) === '3 pensées · 1 aujourd’hui.');

  const groupsNoToday = groupPenseeCards(buildPenseeCards(linked.filter((p) => p.id !== 'p1'), [yohan], TODAY));
  const totalNoToday = groupsNoToday.today.length + groupsNoToday.upcoming.length + groupsNoToday.past.length;
  check(
    'libellé "2 pensées · 2 à venir" quand rien n’est actif aujourd’hui',
    penseeSummaryLabel(totalNoToday, groupsNoToday.today.length, groupsNoToday.upcoming.length) === '2 pensées · 2 à venir.',
  );
  check('libellé zéro : "Aucune pensée liée pour l’instant."', penseeSummaryLabel(0, 0, 0) === 'Aucune pensée liée pour l’instant.');
  check('singulier : "1 pensée"', penseeSummaryLabel(1, 0, 1).startsWith('1 pensée ·'), penseeSummaryLabel(1, 0, 1));
}

// --- Réinitialisation du filtre Pensées au tap direct sur l'onglet -----------------------------------
{
  console.log('\n[9] Tap direct sur l’onglet Pensées → filtre contactId toujours réinitialisé');
  check('paramsForTabPress("Pensées") efface le contactId', JSON.stringify(paramsForTabPress('Pensées')) === JSON.stringify({ contactId: undefined }));
  check('paramsForTabPress sur un autre onglet ne fait rien de spécial', paramsForTabPress('Accueil') === undefined);
  check('paramsForTabPress("Calendrier") ne fait rien de spécial', paramsForTabPress('Calendrier') === undefined);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
