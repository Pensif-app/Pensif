/// <reference types="node" />
// Tests de non-régression — CHANTIER PENSÉES V3 (2026-09-16) : limitation "MÉMORISÉES" à 3, écran
// dédié "Pensées mémorisées" (recherche + filtres locaux, virtualisé), épinglage.
//
// Portée : §A-§E sont RÉELLEMENT EXÉCUTÉS contre les fonctions pures réutilisées (buildPenseeCards,
// groupPenseeCards, penseeAnchor, normalizePensee, searchText.ts) — pas des simulations, les VRAIES
// fonctions dont dépendent PenseesScreen.tsx et MemorizedPenseesScreen.tsx. §F vérifie par lecture de
// code que ces écrans (React Native, pas de harnais de composant dans ce projet) appellent bien ces
// fonctions de la façon attendue — même méthode que les chantiers UX précédents.
//
// Usage : npx tsx scripts/test-regression-pensees-v3.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee } from '../src/data/types';
import { buildPenseeCards, groupPenseeCards } from '../src/data/penseesView';
import { normalizePensee, penseeAnchor } from '../src/data/calendar';
import { matchesSearch, normalizeSearchText } from '../src/data/searchText';

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
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    pinned: false,
    ...overrides,
  };
}

const TODAY = new Date(2026, 8, 16); // 16 septembre 2026, ancre fixe pour tous les tests bucket/anchor

console.log('\n[§A] searchText.ts — normalisation casse/espaces/accents, recherche locale pure');
{
  check('accents supprimés', normalizeSearchText('Épinglée café à  Noël') === 'epinglee cafe a noel');
  check('casse ignorée', normalizeSearchText('RESTAURANT') === normalizeSearchText('restaurant'));
  check('espaces multiples réduits à un seul', normalizeSearchText('un    texte').includes('un texte'));
  check('recherche insensible aux accents (contenu)', matchesSearch('Réserver le restaurant', 'reserver'));
  check('recherche insensible à la casse (contenu)', matchesSearch('Réserver le restaurant', 'RESTAURANT'));
  check('recherche par nom de contact', matchesSearch('Yohan Martin', 'yohan'));
  check('aucun résultat pour un terme absent', !matchesSearch('Réserver le restaurant', 'anniversaire'));
  check('requête vide → matche tout (aucun filtre)', matchesSearch('quoi que ce soit', ''));
}

console.log('\n[§B] normalizePensee — modèle "pinned" (aucun champ équivalent existant réutilisé, ajout minimal)');
{
  check('absent (pensée legacy) → false, jamais inventé à true', normalizePensee({ id: 'p', texte: 'x' }).pinned === false);
  check('false explicite préservé', normalizePensee({ id: 'p', texte: 'x', pinned: false }).pinned === false);
  check('true explicite préservé', normalizePensee({ id: 'p', texte: 'x', pinned: true }).pinned === true);
  check(
    'épingler NE modifie JAMAIS date/endDate/reminderAt (normalisation indépendante)',
    normalizePensee({ id: 'p', texte: 'x', date: '2026-09-24', reminderAt: '2026-09-23T18:00:00.000Z', pinned: true }).date === '2026-09-24' &&
      normalizePensee({ id: 'p', texte: 'x', date: '2026-09-24', reminderAt: '2026-09-23T18:00:00.000Z', pinned: true }).reminderAt ===
        '2026-09-23T18:00:00.000Z',
  );
}

console.log('\n[§B bis] pensée épinglée avec/sans date — penseeAnchor/buildPenseeCards ignorent totalement `pinned`');
{
  const pinnedWithDate = makePensee({ pinned: true, date: '2026-09-24' });
  const pinnedNoDate = makePensee({ pinned: true, date: null });
  check('épinglée + date → ancrée normalement (bucket upcoming/today/past inchangé)', penseeAnchor(pinnedWithDate)?.date === '2026-09-24');
  check('épinglée + sans date → reste sans ancre (bucket memo inchangé)', penseeAnchor(pinnedNoDate) === null);
  const cards = buildPenseeCards([pinnedWithDate, pinnedNoDate], [], TODAY);
  check('bucket de la pensée épinglée datée toujours calculé normalement', cards.find((c) => c.id === pinnedWithDate.id)?.bucket === 'upcoming');
  check('bucket de la pensée épinglée sans date toujours "memo"', cards.find((c) => c.id === pinnedNoDate.id)?.bucket === 'memo');
}

console.log('\n[§C] PenseesScreen — 0/1/3/4/beaucoup pensées mémorisées (logique EXACTE réutilisée : buildPenseeCards → exclusion pinned → groupPenseeCards → slice(0,3))');
{
  function computeMemoSection(pensees: Pensee[]) {
    const cards = buildPenseeCards(pensees, [], TODAY);
    const unpinned = cards.filter((c) => !c.pensee.pinned);
    const groups = groupPenseeCards(unpinned);
    return { visible: groups.memo.slice(0, 3), hasMore: groups.memo.length > 3, total: groups.memo.length };
  }

  {
    const r = computeMemoSection([]);
    check('0 pensée mémorisée → section vide, pas de "Voir toutes"', r.visible.length === 0 && !r.hasMore);
  }
  {
    const r = computeMemoSection([makePensee({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })]);
    check('1 pensée mémorisée → affichée, pas de "Voir toutes"', r.visible.length === 1 && !r.hasMore);
  }
  {
    const list = ['a', 'b', 'c'].map((id, i) => makePensee({ id, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` }));
    const r = computeMemoSection(list);
    check('exactement 3 pensées mémorisées → toutes affichées, PAS de "Voir toutes"', r.visible.length === 3 && !r.hasMore);
  }
  {
    const list = ['a', 'b', 'c', 'd'].map((id, i) => makePensee({ id, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` }));
    const r = computeMemoSection(list);
    check('4 pensées mémorisées → 3 affichées, "Voir toutes" visible', r.visible.length === 3 && r.hasMore === true);
  }
  {
    const list = Array.from({ length: 250 }, (_, i) =>
      makePensee({ id: `p-${i}`, createdAt: new Date(2026, 0, 1 + i).toISOString() }),
    );
    const r = computeMemoSection(list);
    check('beaucoup (250) → toujours seulement 3 affichées sur PenseesScreen', r.visible.length === 3);
    check('"Voir toutes" visible', r.hasMore === true);
    check(
      'exactement les 3 PLUS RÉCENTES, de la plus récente à la plus ancienne (createdAt, seul timestamp déjà présent réutilisé)',
      r.visible[0].pensee.id === 'p-249' && r.visible[1].pensee.id === 'p-248' && r.visible[2].pensee.id === 'p-247',
    );
    check('le compte total (pour la bibliothèque complète) reste exact', r.total === 250);
  }
}

console.log('\n[§D] MemorizedPenseesScreen — pipeline recherche + filtres (logique EXACTE réutilisée)');
{
  const yohan = makeContact({ id: 'yohan', prenom: 'Yohan' });
  const lea = makeContact({ id: 'lea', prenom: 'Léa' });
  const contacts = [yohan, lea];
  const pensees = [
    makePensee({ id: 'p1', texte: 'Voiture à réviser', contactId: 'yohan', createdAt: '2026-01-01T00:00:00.000Z', pinned: false }),
    makePensee({ id: 'p2', texte: 'Aime le café', contactId: 'lea', createdAt: '2026-01-02T00:00:00.000Z', pinned: true }),
    makePensee({ id: 'p3', texte: 'Adore les road trips en voiture', contactId: 'yohan', createdAt: '2026-01-03T00:00:00.000Z', pinned: false }),
    makePensee({ id: 'p4', texte: 'Idée cadeau', contactId: null, createdAt: '2026-01-04T00:00:00.000Z', pinned: false }),
  ];

  function computeFiltered(opts: { query?: string; contactFilter?: string | null; pinnedOnly?: boolean; sortOrder?: 'recent' | 'ancien' }) {
    const { query = '', contactFilter = null, pinnedOnly = false, sortOrder = 'recent' } = opts;
    let list = buildPenseeCards(pensees, contacts, TODAY).filter((c) => c.bucket === 'memo');
    if (contactFilter) list = list.filter((c) => c.pensee.contactId === contactFilter);
    if (pinnedOnly) list = list.filter((c) => c.pensee.pinned);
    if (query.trim()) {
      list = list.filter((c) => {
        if (matchesSearch(c.pensee.texte, query)) return true;
        const contact = c.pensee.contactId ? contacts.find((x) => x.id === c.pensee.contactId) : null;
        return contact ? matchesSearch(`${contact.prenom} ${contact.nom}`, query) : false;
      });
    }
    return [...list].sort((a, b) =>
      sortOrder === 'recent' ? b.pensee.createdAt.localeCompare(a.pensee.createdAt) : a.pensee.createdAt.localeCompare(b.pensee.createdAt),
    );
  }

  check('sans filtre : toutes les pensées mémorisées présentes', computeFiltered({}).length === 4);
  check('recherche par texte ("voiture") → p1 et p3', computeFiltered({ query: 'voiture' }).map((c) => c.id).sort().join(',') === 'p1,p3');
  check('recherche par contact ("Yohan") → p1 et p3 (liées à Yohan)', computeFiltered({ query: 'Yohan' }).map((c) => c.id).sort().join(',') === 'p1,p3');
  check('recherche sans résultat', computeFiltered({ query: 'anniversaire surprise' }).length === 0);
  check('filtre contact = Léa → seulement p2', computeFiltered({ contactFilter: 'lea' }).map((c) => c.id).join(',') === 'p2');
  check('tri "plus récentes" → p4, p3, p2, p1', computeFiltered({ sortOrder: 'recent' }).map((c) => c.id).join(',') === 'p4,p3,p2,p1');
  check('tri "plus anciennes" → p1, p2, p3, p4', computeFiltered({ sortOrder: 'ancien' }).map((c) => c.id).join(',') === 'p1,p2,p3,p4');
  check('filtre "épinglées uniquement" → seulement p2', computeFiltered({ pinnedOnly: true }).map((c) => c.id).join(',') === 'p2');
  check(
    'combinaison recherche + contact (exemple exact de la consigne : Yohan + "voiture") → p1 et p3',
    computeFiltered({ query: 'voiture', contactFilter: 'yohan' }).map((c) => c.id).sort().join(',') === 'p1,p3',
  );
  check('combinaison recherche + épinglées ("café" + épinglées uniquement) → seulement p2', computeFiltered({ query: 'café', pinnedOnly: true }).map((c) => c.id).join(',') === 'p2');
}

console.log('\n[§E] Absence de doublon visuel PenseesScreen — aucune pensée épinglée dans les sections normales');
{
  const contacts: Contact[] = [];
  const pensees = [
    makePensee({ id: 'pin-today', pinned: true, date: '2026-09-16' }), // aujourd'hui = TODAY
    makePensee({ id: 'pin-memo', pinned: true, date: null, createdAt: '2026-01-01T00:00:00.000Z' }),
    makePensee({ id: 'normal-memo', pinned: false, date: null, createdAt: '2026-01-02T00:00:00.000Z' }),
  ];
  const cards = buildPenseeCards(pensees, contacts, TODAY);
  const pinnedCards = cards.filter((c) => c.pensee.pinned);
  const unpinnedCards = cards.filter((c) => !c.pensee.pinned);
  const groups = groupPenseeCards(unpinnedCards);
  const allSectionIds = [...groups.today, ...groups.upcoming, ...groups.past, ...groups.memo].map((c) => c.id);
  check('les 2 pensées épinglées apparaissent dans pinnedCards', pinnedCards.length === 2);
  check('AUCUNE pensée épinglée ne réapparaît dans une section normale (today/upcoming/past/memo)', pinnedCards.every((c) => !allSectionIds.includes(c.id)));
  check('la pensée normale (non épinglée) reste bien dans sa section (memo)', groups.memo.some((c) => c.id === 'normal-memo'));
}

console.log('\n[§F] Vérification du câblage réel des écrans (lecture de code — pas de harnais RN dans ce projet)');
{
  const penseesSrc = readScreen('PenseesScreen');
  const penseeDetailSrc = readScreen('PenseeDetailScreen');
  const memorizedSrc = readScreen('MemorizedPenseesScreen');

  console.log('  [PenseesScreen.tsx]');
  check('pinnedCards exclu des groupes normaux avant groupPenseeCards', /const unpinnedCards = useMemo\(\(\) => allCards\.filter\(\(c\) => !c\.pensee\.pinned\)/.test(penseesSrc));
  check('section "ÉPINGLÉES" strictement conditionnelle (jamais affichée vide)', /\{pinnedCards\.length > 0 && \(/.test(penseesSrc));
  check('mémorisées limitées à 3 (slice(0, 3))', /groups\.memo\.slice\(0, 3\)/.test(penseesSrc));
  check('bouton "Voir toutes les pensées mémorisées" conditionnel à hasMoreMemo', /\{hasMoreMemo && \([\s\S]{0,200}Voir toutes les pensées mémorisées/.test(penseesSrc));
  check('navigue vers l’écran dédié (pas une réimplémentation locale)', penseesSrc.includes("navigation.navigate('PenseesMemorisees')"));
  check('PenseeRow exporté (réutilisé, pas dupliqué)', penseesSrc.includes('export function PenseeRow('));

  console.log('  [PenseeDetailScreen.tsx]');
  check('icône épingler/désépingler dans le header (comme le favori de FicheScreen)', /Ionicons name={pinned \? 'pin' : 'pin-outline'}/.test(penseeDetailSrc));
  check('appui long/sélection multiple non touchés par ce chantier (aucune mention dans ce fichier)', !/selectionMode|onLongPress/.test(penseeDetailSrc));
  check('pinned inclus dans la mise à jour d’une pensée existante', /endDate: eventDate \? existing\.endDate \?\? null : null,\s*pinned,/.test(penseeDetailSrc));
  check('pinned inclus dans la création d’une nouvelle pensée', /addPensee\(\{\s*texte: texte\.trim\(\),\s*contactId,\s*pinned,/.test(penseeDetailSrc));

  console.log('  [MemorizedPenseesScreen.tsx]');
  check('placeholder de recherche exact', memorizedSrc.includes('placeholder="Rechercher dans mes pensées"'));
  check('recherche 100% locale : aucun appel réseau/LLM (fetch/supabase/openai/anthropic absents du fichier)', !/fetch\(|supabase\.|openai|anthropic/i.test(memorizedSrc));
  check('liste virtualisée : FlatList utilisé, jamais un .map() plein sur la liste filtrée', memorizedSrc.includes('<FlatList') && !/filtered\.map\(/.test(memorizedSrc));
  check('un seul bouton filtre (pas plusieurs boutons/chips permanents à côté de la recherche)', (memorizedSrc.match(/accessibilityLabel="Filtrer"/g) ?? []).length === 1);
  check('aucun filtre "date" (les pensées mémorisées sont précisément sans date)', !/MODAL_SECTION_LABEL.*DATE|>DATE</.test(memorizedSrc) && !memorizedSrc.includes("styles.modalSectionLabel, { color: theme.inkSoft }]}>DATE"));
  check('filtres CONTACT/TRI/ÉPINGLÉES tous présents', memorizedSrc.includes('>CONTACT<') && memorizedSrc.includes('>TRI<') && memorizedSrc.includes('>ÉPINGLÉES<'));
  check('réinitialisation des filtres prévue', memorizedSrc.includes('Réinitialiser les filtres'));
  check('aucune pagination visible (1/2/3/Suivant/Précédent) — aucune de ces chaînes dans le fichier', !/Suivant|Précédent|Page \d/.test(memorizedSrc));
  check('titre du header défini côté navigation (RootNavigator), pas de titre inventé ici', !memorizedSrc.includes("navigation.setOptions"));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
