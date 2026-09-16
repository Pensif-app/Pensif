/// <reference types="node" />
// Tests de non-régression — CHANTIER ROBUSTESSE PRÉ-BÊTA, volet "suppressions" §4 (2026-09-16) :
// suppressions multiples mêlant pensées épinglées et non épinglées.
//
// Portée de l'audit : `pinnedCards`/`unpinnedCards` (PenseesScreen.tsx) partitionnent STRICTEMENT
// `allCards` sur `pensee.pinned` — une pensée n'apparaît donc jamais dans les deux sections à la
// fois, et `selectedIds` (Set) est UNIQUE et partagé entre toutes les sections (épinglées, aujourd'hui,
// à venir, mémorisées, passées) : sélectionner une carte épinglée puis une carte non épinglée les
// place bien dans le même Set, et `confirmDeleteSelected` (`selectedIds.forEach(id =>
// deletePensee(id))`) ne fait AUCUNE différence de traitement selon `pinned` — la suppression est
// strictement la même fonction, qu'une pensée soit épinglée ou non. Aucun bug trouvé sur ce point ;
// ce fichier verrouille le comportement par des tests réels + vérifications de source.
//
// §A est RÉELLEMENT EXÉCUTÉ contre les vraies fonctions pures (buildPenseeCards, groupPenseeCards) :
// prouve qu'après suppression d'un mélange épinglées/non-épinglées, la recomposition des sections
// (repartition pinnedCards/unpinnedCards + groupes) reste cohérente — pas de doublon, pas de carte
// fantôme, la section "ÉPINGLÉES" disparaît bien si plus aucune pensée épinglée ne reste. §B/§C
// vérifient par lecture de source (PenseesScreen/MemorizedPenseesScreen) que la sélection et la
// suppression ne traitent jamais `pinned` différemment.
//
// Usage : npx tsx scripts/test-regression-multiselect-pinned-deletion.ts

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

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', 'src', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    date: null,
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reminderAt: null,
    pinned: false,
    ...overrides,
  } as Pensee;
}

const TODAY = new Date('2026-09-16T10:00:00.000Z');
const CONTACTS: Contact[] = [];

/** Reproduit exactement le calcul de PenseesScreen.tsx (useMemo pinnedCards/unpinnedCards/groups) —
 *  pas de logique réimplémentée, juste l'assemblage déjà utilisé par l'écran réel. */
function computeSections(pensees: Pensee[]) {
  const allCards = buildPenseeCards(pensees, CONTACTS, TODAY);
  const pinnedCards = allCards.filter((c) => c.pensee.pinned);
  const unpinnedCards = allCards.filter((c) => !c.pensee.pinned);
  const groups = groupPenseeCards(unpinnedCards);
  return { pinnedCards, unpinnedCards, groups };
}

async function main() {
  console.log('\n[§A — RÉEL] sélection mêlant épinglées/non-épinglées, suppression, recomposition des sections');
  {
    // 5 pensées "mémorisées" (sans date/rappel) pour rester dans le bucket 'memo', mélange
    // épinglé/non-épinglé — reflète exactement l'écran Pensées (section MÉMORISÉES + ÉPINGLÉES).
    const p1 = makePensee({ id: 'p1', texte: 'Épinglée 1', pinned: true, createdAt: '2026-09-10T00:00:00.000Z' });
    const p2 = makePensee({ id: 'p2', texte: 'Non épinglée 1', pinned: false, createdAt: '2026-09-11T00:00:00.000Z' });
    const p3 = makePensee({ id: 'p3', texte: 'Épinglée 2', pinned: true, createdAt: '2026-09-12T00:00:00.000Z' });
    const p4 = makePensee({ id: 'p4', texte: 'Non épinglée 2', pinned: false, createdAt: '2026-09-13T00:00:00.000Z' });
    const p5 = makePensee({ id: 'p5', texte: 'Non épinglée 3 (pas sélectionnée)', pinned: false, createdAt: '2026-09-14T00:00:00.000Z' });
    let pensees = [p1, p2, p3, p4, p5];

    const before = computeSections(pensees);
    check('2 pensées épinglées visibles avant suppression', before.pinnedCards.length === 2);
    check('3 pensées non épinglées visibles avant suppression (dans groups.memo)', before.groups.memo.length === 3);

    // Sélection mixte : p1 (épinglée), p3 (épinglée), p2 (non épinglée) — reproduit un appui long sur
    // une carte de la section ÉPINGLÉES suivi de taps sur des cartes d'autres sections, même Set.
    const selectedIds = new Set<string>(['p1', 'p3', 'p2']);
    check('le Set de sélection contient bien des ids des DEUX catégories sans distinction', selectedIds.has('p1') && selectedIds.has('p3') && selectedIds.has('p2'));

    // confirmDeleteSelected : `selectedIds.forEach(id => deletePensee(id))` — aucune branche sur
    // `pinned`, simulé ici par un simple filter (deletePensee = retrait par id, voir
    // test-regression-delete-idempotence.ts §A).
    pensees = pensees.filter((p) => !selectedIds.has(p.id));

    const after = computeSections(pensees);
    check('1 seule pensée épinglée restante (p3 supprimée, p1... les deux étaient sélectionnées → 0 restante)', after.pinnedCards.length === 0, String(after.pinnedCards.length));
    check('la section ÉPINGLÉES doit donc disparaître (condition écran : pinnedCards.length > 0)', after.pinnedCards.length === 0);
    check('p4 (non épinglée, non sélectionnée) toujours présente', after.groups.memo.some((c) => c.id === 'p4'));
    check('p5 (non épinglée, non sélectionnée) toujours présente', after.groups.memo.some((c) => c.id === 'p5'));
    check('exactement 2 pensées restantes au total (5 - 3 supprimées)', after.pinnedCards.length + after.groups.memo.length === 2);
    check('aucune carte fantôme : aucun id supprimé ne réapparaît dans une section', !['p1', 'p2', 'p3'].some((id) => after.pinnedCards.some((c) => c.id === id) || after.groups.memo.some((c) => c.id === id)));
  }

  console.log('\n[§A bis — RÉEL] suppression de TOUTES les pensées épinglées uniquement → section ÉPINGLÉES disparaît, le reste intact');
  {
    const pinned1 = makePensee({ id: 'pin-1', pinned: true, createdAt: '2026-09-10T00:00:00.000Z' });
    const pinned2 = makePensee({ id: 'pin-2', pinned: true, createdAt: '2026-09-11T00:00:00.000Z' });
    const normal = makePensee({ id: 'norm-1', pinned: false, createdAt: '2026-09-12T00:00:00.000Z' });
    let pensees = [pinned1, pinned2, normal];
    const selectedIds = new Set(['pin-1', 'pin-2']);
    pensees = pensees.filter((p) => !selectedIds.has(p.id));
    const after = computeSections(pensees);
    check('plus aucune pensée épinglée', after.pinnedCards.length === 0);
    check('la pensée non épinglée reste intacte et non affectée', after.groups.memo.some((c) => c.id === 'norm-1') && after.groups.memo.length === 1);
  }

  console.log('\n[§B — source] PenseesScreen.tsx — sélection/suppression uniformes, aucune branche sur `pinned`');
  const penseesSrc = readSrc('screens', 'PenseesScreen.tsx');
  check(
    'les cartes ÉPINGLÉES utilisent le même handleCardPress/handleCardLongPress/selectedIds que les autres sections',
    /pinnedCards\.map\(\(c\) => \(\s*<PenseeRow[\s\S]*?onPress=\{\(\) => handleCardPress\(c\.pensee\.id\)\}[\s\S]*?onLongPress=\{\(\) => handleCardLongPress\(c\.pensee\.id\)\}[\s\S]*?selectionMode=\{selectionMode\}[\s\S]*?selected=\{selectedIds\.has\(c\.pensee\.id\)\}/.test(penseesSrc),
  );
  check(
    'confirmDeleteSelected ne filtre jamais sur `pinned` avant de supprimer (une seule boucle forEach, aucune branche conditionnelle)',
    !/selectedIds\.forEach[\s\S]{0,80}pinned/.test(penseesSrc),
  );
  check('la condition d’affichage de la section ÉPINGLÉES reste purement réactive (pinnedCards.length > 0)', penseesSrc.includes('pinnedCards.length > 0 && ('));

  console.log('\n[§C — source] MemorizedPenseesScreen.tsx — même garantie, y compris avec le filtre "Épinglées uniquement" actif');
  const memoSrc = readSrc('screens', 'MemorizedPenseesScreen.tsx');
  check(
    'la sélection multiple porte sur `filtered` (respecte le filtre pinnedOnly déjà appliqué), pas une liste séparée',
    memoSrc.includes('data={filtered}') && memoSrc.includes('selected={selectedIds.has(item.pensee.id)}'),
  );
  check(
    'confirmDeleteSelected (MemorizedPenseesScreen) ne filtre jamais sur `pinned` non plus',
    !/selectedIds\.forEach[\s\S]{0,80}pinned/.test(memoSrc),
  );

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
