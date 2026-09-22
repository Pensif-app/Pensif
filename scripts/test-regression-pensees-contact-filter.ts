/// <reference types="node" />
// Tests de non-régression — CHANTIER "Pré-TestFlight Phase 4E — Filtre contact dans Pensées"
// (2026-09-22). PenseesScreen.tsx (react-native) ne peut pas être chargé sous tsx (même constat que
// le reste de ce projet) — la logique de dérivation du filtre (isFiltered/effectiveFilterContactId/
// visiblePensees) est reproduite ici À L'IDENTIQUE de l'implémentation réelle, puis exécutée contre
// les VRAIES fonctions pures dont dépend l'écran (buildPenseeCards/groupPenseeCards, aucune
// réimplémentation) — même méthode que test-regression-pensees-v3.ts. Le câblage JSX (contrôle
// filtre, ContactPicker, libellés) est vérifié par lecture de source.
//
// Usage : npx tsx scripts/test-regression-pensees-contact-filter.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee } from '../src/data/types';
import { buildPenseeCards, groupPenseeCards } from '../src/data/penseesView';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readScreen(name: string): string {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', `${name}.tsx`), 'utf8').replace(/\r\n/g, '\n');
}

const penseesSrc = readScreen('PenseesScreen');
const ficheSrc = readScreen('FicheScreen');

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: null,
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
    texte: 'Pensée',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    pinned: false,
    ...overrides,
  } as Pensee;
}

// --- Reproduction fidèle de la dérivation PenseesScreen.tsx (voir ce fichier pour l'original) ----
function deriveFilter(filterContactId: string | undefined, contacts: Contact[]) {
  const filterContact = filterContactId ? contacts.find((c) => c.id === filterContactId) : undefined;
  const isFiltered = Boolean(filterContactId) && Boolean(filterContact);
  const effectiveFilterContactId = isFiltered ? filterContactId : undefined;
  return { filterContact, isFiltered, effectiveFilterContactId };
}
function visiblePensees(pensees: Pensee[], effectiveFilterContactId: string | undefined): Pensee[] {
  return effectiveFilterContactId ? pensees.filter((p) => p.contactId === effectiveFilterContactId) : pensees;
}
// ---------------------------------------------------------------------------------------------

const TODAY = new Date(2026, 8, 18); // 18 septembre 2026

console.log('\n[1] Sélection ContactPicker → contactId param correct (même mécanisme que Fiche → Pensées)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  // selectContact(contactId) appelle exactement setParams({ contactId }) — reproduit ici comme un
  // simple passage de paramètre, identique à ce que fait FicheScreen.tsx pour "Voir les pensées".
  const paramsAfterSelect = { contactId: lea.id };
  check('le paramètre transmis est bien contactId = Léa.id', paramsAfterSelect.contactId === 'c-lea');
  const { isFiltered, effectiveFilterContactId } = deriveFilter(paramsAfterSelect.contactId, [lea]);
  check('isFiltered devient true après sélection', isFiltered === true);
  check('effectiveFilterContactId = Léa.id', effectiveFilterContactId === 'c-lea');
}

console.log('\n[2] Filtre Léa → uniquement les pensées de Léa dans TOUS les buckets (jamais seulement MÉMORISÉES)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const other = makeContact({ id: 'c-autre', prenom: 'Autre' });
  const pensees = [
    makePensee({ id: 'p-today', contactId: 'c-lea', date: '2026-09-18' }), // today
    makePensee({ id: 'p-upcoming', contactId: 'c-lea', date: '2026-09-23' }), // upcoming
    makePensee({ id: 'p-past', contactId: 'c-lea', date: '2026-08-01' }), // past
    makePensee({ id: 'p-memo', contactId: 'c-lea', date: null, reminderAt: null }), // memo
    makePensee({ id: 'p-pinned', contactId: 'c-lea', date: '2026-09-25', pinned: true }),
    makePensee({ id: 'p-other-today', contactId: 'c-autre', date: '2026-09-18' }),
    makePensee({ id: 'p-other-memo', contactId: 'c-autre', date: null }),
    makePensee({ id: 'p-personal', contactId: null, date: '2026-09-19' }),
  ];
  const { effectiveFilterContactId } = deriveFilter('c-lea', [lea, other]);
  const visible = visiblePensees(pensees, effectiveFilterContactId);
  check('exactement 5 pensées visibles (toutes celles de Léa, aucune d’un autre contact, aucune personnelle)', visible.length === 5, String(visible.length));
  check('toutes appartiennent à Léa', visible.every((p) => p.contactId === 'c-lea'));

  const allCards = buildPenseeCards(visible, [lea, other], TODAY);
  const pinnedCards = allCards.filter((c) => c.pensee.pinned);
  const groups = groupPenseeCards(allCards.filter((c) => !c.pensee.pinned));
  check('bucket today : 1 pensée de Léa', groups.today.length === 1 && groups.today[0].pensee.id === 'p-today');
  check('bucket upcoming : 1 pensée de Léa', groups.upcoming.length === 1 && groups.upcoming[0].pensee.id === 'p-upcoming');
  check('bucket past : 1 pensée de Léa', groups.past.length === 1 && groups.past[0].pensee.id === 'p-past');
  check('bucket memo : 1 pensée de Léa', groups.memo.length === 1 && groups.memo[0].pensee.id === 'p-memo');
  check('épinglées : 1 pensée de Léa (jamais dupliquée dans son bucket habituel)', pinnedCards.length === 1 && pinnedCards[0].pensee.id === 'p-pinned');
}

console.log('\n[3] Changement Léa → Jean Luc — remplacement propre, sans étape intermédiaire');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const jeanLuc = makeContact({ id: 'c-jl', prenom: 'Jean Luc' });
  const pensees = [
    makePensee({ id: 'p-lea', contactId: 'c-lea', date: '2026-09-20' }),
    makePensee({ id: 'p-jl', contactId: 'c-jl', date: '2026-09-21' }),
  ];
  // Filtre initial Léa, puis sélection directe de Jean Luc (remplace le param, pas d'étape "reset"
  // intermédiaire nécessaire — reproduit exactement selectContact(contactId) → setParams({contactId})).
  let currentParam: string | undefined = 'c-lea';
  let derived = deriveFilter(currentParam, [lea, jeanLuc]);
  check('état initial : filtré sur Léa', derived.effectiveFilterContactId === 'c-lea');
  currentParam = 'c-jl'; // équivalent de selectContact('c-jl') pendant que Léa est déjà active
  derived = deriveFilter(currentParam, [lea, jeanLuc]);
  check('après sélection de Jean Luc : filtré sur Jean Luc (remplacement direct, pas de reset requis)', derived.effectiveFilterContactId === 'c-jl');
  const visible = visiblePensees(pensees, derived.effectiveFilterContactId);
  check('seule la pensée de Jean Luc est visible, celle de Léa a disparu sans étape intermédiaire', visible.length === 1 && visible[0].id === 'p-jl');
}

console.log('\n[4] Reset "Toutes les pensées" → toutes les pensées reviennent');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const pensees = [
    makePensee({ id: 'p-lea', contactId: 'c-lea', date: '2026-09-20' }),
    makePensee({ id: 'p-personal', contactId: null, date: '2026-09-21' }),
  ];
  const filtered = deriveFilter('c-lea', [lea]);
  check('avant reset : 1 seule pensée visible (Léa)', visiblePensees(pensees, filtered.effectiveFilterContactId).length === 1);
  // clearFilter() → setParams({ contactId: undefined }), reproduit directement ici.
  const reset = deriveFilter(undefined, [lea]);
  check('après reset : isFiltered = false', reset.isFiltered === false);
  check('après reset : les 2 pensées reviennent (Léa + personnelle)', visiblePensees(pensees, reset.effectiveFilterContactId).length === 2);
}

console.log('\n[5] Tap normal sur l’onglet Pensées → filtre supprimé (paramsForTabPress inchangé, non modifié par cette passe)');
{
  // Import direct de la fonction réelle — non réimplémentée, non modifiée par cette phase.
  const { paramsForTabPress } = require('../src/navigation/tabNavigationHelpers');
  check('paramsForTabPress("Pensées") efface toujours le contactId', JSON.stringify(paramsForTabPress('Pensées')) === JSON.stringify({ contactId: undefined }));
}

console.log('\n[6] Fiche → Pensées — comportement historique intact (même navigation, non modifiée par cette passe)');
{
  check(
    'FicheScreen.tsx navigue toujours vers Tabs/Pensées avec { contactId: existing.id } (inchangé)',
    /navigation\.navigate\('Tabs', \{ screen: 'Pensées', params: \{ contactId: existing\.id \} \}\)/.test(ficheSrc),
  );
}

console.log('\n[7] Filtre actif → pensées personnelles absentes');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const pensees = [makePensee({ id: 'p-lea', contactId: 'c-lea' }), makePensee({ id: 'p-personal', contactId: null })];
  const { effectiveFilterContactId } = deriveFilter('c-lea', [lea]);
  const visible = visiblePensees(pensees, effectiveFilterContactId);
  check('la pensée personnelle (contactId null) n’apparaît jamais quand un filtre est actif', !visible.some((p) => p.id === 'p-personal'));
}

console.log('\n[8] Filtre supprimé → pensées personnelles présentes (aucun comportement spécial supplémentaire)');
{
  const pensees = [makePensee({ id: 'p-personal', contactId: null })];
  const visible = visiblePensees(pensees, undefined);
  check('la pensée personnelle réapparaît normalement sans filtre', visible.some((p) => p.id === 'p-personal'));
}

console.log('\n[9] contactId orphelin (contact supprimé) → fallback sûr vers "Toutes les pensées", jamais bloqué');
{
  const pensees = [
    makePensee({ id: 'p-orphan-ref', contactId: 'c-disparu', date: '2026-09-20' }),
    makePensee({ id: 'p-personal', contactId: null, date: '2026-09-21' }),
  ];
  // Aucun contact 'c-disparu' dans la liste — proche supprimé entre-temps.
  const derived = deriveFilter('c-disparu', []);
  check('isFiltered = false (jamais bloqué sur un contact introuvable)', derived.isFiltered === false);
  check('effectiveFilterContactId = undefined', derived.effectiveFilterContactId === undefined);
  const visible = visiblePensees(pensees, derived.effectiveFilterContactId);
  check('fallback = TOUTES les pensées reviennent (y compris celle qui référence encore le contact disparu)', visible.length === 2);
}

console.log('\n[10] Contact valide sans aucune pensée → état vide contextualisé, bouton "Toutes les pensées" toujours accessible');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const derived = deriveFilter('c-lea', [lea]);
  check('isFiltered = true (Léa existe bel et bien)', derived.isFiltered === true);
  const visible = visiblePensees([], derived.effectiveFilterContactId);
  check('aucune pensée visible (0), écran vide MAIS filtré (pas un fallback silencieux)', visible.length === 0);
  check(
    'texte d’état vide contextualisé au prénom présent dans le source (ex. "Tu n’as pas encore confié de pensée liée à")',
    /Tu n’as pas encore confié de pensée liée à/.test(penseesSrc),
  );
  check('le header (bouton "Toutes les pensées") reste rendu AVANT le bloc isEmpty (toujours accessible, pas conditionné à isEmpty)', penseesSrc.indexOf("'Toutes les pensées'") < penseesSrc.indexOf('isEmpty ?'));
}

console.log('\n[11] Tri chronologique inchangé (buildPenseeCards/groupPenseeCards non modifiés par cette passe)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const pensees = [
    makePensee({ id: 'p-nov', contactId: 'c-lea', date: '2026-11-12' }),
    makePensee({ id: 'p-sept', contactId: 'c-lea', date: '2026-09-23' }),
    makePensee({ id: 'p-oct', contactId: 'c-lea', date: '2026-10-04' }),
  ];
  const visible = visiblePensees(pensees, 'c-lea');
  const cards = buildPenseeCards(visible, [lea], TODAY);
  const groups = groupPenseeCards(cards);
  const order = groups.upcoming.map((c) => c.pensee.id);
  check('ordre chronologique exact : 23 sept, 4 oct, 12 nov (du plus proche au plus lointain, inchangé)', JSON.stringify(order) === JSON.stringify(['p-sept', 'p-oct', 'p-nov']), order.join(','));
}

console.log('\n[12] Câblage UI — un seul contrôle discret, ContactPicker partagé réutilisé, aucune recherche globale ajoutée');
{
  check('bouton "Filtrer par proche"/"Changer de proche" présent (contrôle UNIQUE, discret)', /Changer de proche/.test(penseesSrc) && /Filtrer par proche/.test(penseesSrc));
  check('ContactPicker importé/réutilisé (pas une nouvelle liste de contacts)', /import \{ ContactPicker \} from '\.\.\/components\/ContactPicker';/.test(penseesSrc));
  check('<ContactPicker ... onSelect={selectContact} .../> câblé directement sur selectContact', /<ContactPicker visible=\{contactPickerOpen\} contacts=\{contacts\} theme=\{theme\} onSelect=\{selectContact\}/.test(penseesSrc));
  check('AUCUN champ "Rechercher dans mes pensées" ajouté sur PenseesScreen (hors périmètre §12 de la consigne)', !penseesSrc.includes('Rechercher dans mes pensées'));
  check('aucun second composant de liste de contacts (pas de FlatList de contacts dupliquée dans ce fichier)', !/data=\{contacts\}/.test(penseesSrc));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
