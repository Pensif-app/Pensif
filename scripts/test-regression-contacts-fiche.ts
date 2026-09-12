// Tests de non-régression — CHANTIER PROCHES + FICHE V1 (tri ContactsScreen, libellé anniversaire,
// résumé pensées liées, réinitialisation du filtre au tap direct sur l'onglet Pensées). Logique pure
// uniquement — ContactsScreen.tsx/FicheScreen.tsx/PenseesScreen.tsx importent des composants
// react-native et ne peuvent pas être chargés sous ts-node (même constat que les chantiers
// précédents) ; le comparateur de tri et le résumé de pensées sont donc extraits ici à l'identique
// de leur implémentation réelle pour rester vérifiables. Lecture seule.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-contacts-fiche.ts

import { Contact, Pensee } from '../src/data/types';
import { birthdayCountdownLabel, daysUntilNext } from '../src/data/calendar';
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
    remind: '0',
    contactId: null,
    ...overrides,
  };
}

// Reproduit EXACTEMENT le comparateur de src/screens/ContactsScreen.tsx (non exporté, composant
// react-native non chargeable ici) — voir ce fichier pour l'original.
function compareContacts(a: Contact, b: Contact, today: Date): number {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  const aHasDate = Boolean(a.date);
  const bHasDate = Boolean(b.date);
  if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
  if (aHasDate && bHasDate) {
    const diff = daysUntilNext(a.date, today) - daysUntilNext(b.date, today);
    if (diff !== 0) return diff;
  }
  return `${a.prenom} ${a.nom}`.trim().localeCompare(`${b.prenom} ${b.nom}`.trim());
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
  const fav = makeContact({ id: 'fav', prenom: 'Zoe', favorite: true, date: '1990-06-01' });
  const nonFav = makeContact({ id: 'nonfav', prenom: 'Aaron', favorite: false, date: '1990-01-16' });
  const sorted = [nonFav, fav].sort((a, b) => compareContacts(a, b, TODAY));
  check('favori en premier malgré anniversaire plus lointain et nom postérieur', sorted[0].id === 'fav', sorted.map((c) => c.id).join(','));
}

// --- Favoris triés ensuite par anniversaire -------------------------------------------------------
{
  console.log('\n[2] Favoris triés entre eux par prochain anniversaire');
  const favFar = makeContact({ id: 'fav-far', prenom: 'A', favorite: true, date: '1990-06-01' });
  const favNear = makeContact({ id: 'fav-near', prenom: 'Z', favorite: true, date: '1990-01-17' });
  const sorted = [favFar, favNear].sort((a, b) => compareContacts(a, b, TODAY));
  check('le favori dont l’anniversaire est le plus proche passe en premier', sorted[0].id === 'fav-near', sorted.map((c) => c.id).join(','));
}

// --- Non-favoris triés par anniversaire -------------------------------------------------------------
{
  console.log('\n[3] Non-favoris triés par prochain anniversaire');
  const far = makeContact({ id: 'far', prenom: 'A', favorite: false, date: '1990-08-01' });
  const near = makeContact({ id: 'near', prenom: 'Z', favorite: false, date: '1990-01-20' });
  const sorted = [far, near].sort((a, b) => compareContacts(a, b, TODAY));
  check('le plus proche passe en premier malgré l’ordre alphabétique inverse', sorted[0].id === 'near', sorted.map((c) => c.id).join(','));
}

// --- Égalité → alphabétique --------------------------------------------------------------------------
{
  console.log('\n[4] Égalité de favori et de date d’anniversaire → tri alphabétique');
  const zoe = makeContact({ id: 'zoe', prenom: 'Zoe', nom: '', favorite: false, date: '1990-03-10' });
  const aaron = makeContact({ id: 'aaron', prenom: 'Aaron', nom: '', favorite: false, date: '1985-03-10' });
  const sorted = [zoe, aaron].sort((a, b) => compareContacts(a, b, TODAY));
  check('Aaron avant Zoe (même occurrence annuelle, années de naissance différentes)', sorted[0].id === 'aaron', sorted.map((c) => c.id).join(','));
}

// --- Sans anniversaire après ceux avec anniversaire -------------------------------------------------
{
  console.log('\n[5] Contact sans date d’anniversaire relégué après ceux qui en ont une');
  const withDate = makeContact({ id: 'with-date', prenom: 'Z', favorite: false, date: '1990-12-01' });
  const noDate = makeContact({ id: 'no-date', prenom: 'A', favorite: false, date: '' });
  const sorted = [noDate, withDate].sort((a, b) => compareContacts(a, b, TODAY));
  check('celui avec une date passe en premier malgré l’ordre alphabétique inverse', sorted[0].id === 'with-date', sorted.map((c) => c.id).join(','));

  // Reste vrai côté favoris aussi (même groupe, comparaison indépendante du statut favori).
  const favNoDate = makeContact({ id: 'fav-no-date', prenom: 'A', favorite: true, date: '' });
  const favWithDate = makeContact({ id: 'fav-with-date', prenom: 'Z', favorite: true, date: '1990-12-01' });
  const sortedFav = [favNoDate, favWithDate].sort((a, b) => compareContacts(a, b, TODAY));
  check('même règle à l’intérieur du groupe des favoris', sortedFav[0].id === 'fav-with-date', sortedFav.map((c) => c.id).join(','));
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
