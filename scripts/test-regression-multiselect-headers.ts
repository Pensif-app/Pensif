/// <reference types="node" />
// Tests de non-régression — AJOUT AU CHANTIER UX : sélection multiple + compaction des headers
// (2026-09-16). §5 header sélection Pensées ne déborde plus, §6 sélection multiple Proches, §7
// sélection multiple Pensées mémorisées, §8 espace remonté Pensées mémorisées.
//
// §A est RÉELLEMENT EXÉCUTÉ contre la vraie fonction pure `contactsDeletionMessage`/
// `contactsDeletionTitle` (contactDeletionMessage.ts) qu'utilise ContactsScreen.tsx. Le reste
// vérifie par lecture de code (pas de harnais de composant React Native dans ce projet — même
// méthode que les chantiers UX précédents) que les écrans appellent bien ces éléments.
//
// Usage : npx tsx scripts/test-regression-multiselect-headers.ts

import * as fs from 'fs';
import * as path from 'path';
import { contactsDeletionMessage, contactsDeletionTitle } from '../src/data/contactDeletionMessage';

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

console.log('\n[§A — contactsDeletionTitle / contactsDeletionMessage (RÉEL, exécuté)]');
check('1 proche, titre singulier', contactsDeletionTitle(1) === 'Supprimer ce proche ?');
check('3 proches, titre pluriel', contactsDeletionTitle(3) === 'Supprimer 3 proches ?');
check('1 proche, 0 pensée liée', contactsDeletionMessage(1, 0) === 'Cette fiche et son quiz seront définitivement supprimés.');
check('3 proches, 0 pensée liée (pluriel fiches)', contactsDeletionMessage(3, 0) === 'Ces fiches et leurs quiz seront définitivement supprimés.');
check(
  '1 proche, 1 pensée liée',
  contactsDeletionMessage(1, 1) === 'Cette fiche et son quiz seront définitivement supprimés. La pensée liée sera conservée sans proche.',
);
check(
  '3 proches, 7 pensées liées — exemple exact du chantier',
  contactsDeletionMessage(3, 7) === 'Ces fiches et leurs quiz seront définitivement supprimés. Les 7 pensées liées seront conservées sans proche.',
);

console.log('\n[§B — SelectionHeader.tsx (source) — ne déborde jamais]');
const selHeaderSrc = readSrc('components', 'SelectionHeader.tsx');
check('compteur en flexShrink:1 + numberOfLines={1} (ellipse plutôt que pousser les boutons)', selHeaderSrc.includes('flexShrink: 1') && selHeaderSrc.includes('numberOfLines={1}'));
check('actions (Annuler/Supprimer) en flexShrink:0 (jamais compressées hors écran)', selHeaderSrc.includes('flexShrink: 0'));
check('libellé compact "X sélectionnée(s)" sans répéter le nom de l’entité', selHeaderSrc.includes("plural : singular"));
check('conserve Annuler', selHeaderSrc.includes('Annuler'));
check('conserve Supprimer', selHeaderSrc.includes('Supprimer'));

console.log('\n[§5 — PenseesScreen.tsx utilise le header mutualisé]');
const penseesSrc = readSrc('screens', 'PenseesScreen.tsx');
check('importe SelectionHeader', penseesSrc.includes("import { SelectionHeader } from '../components/SelectionHeader'"));
check('utilise <SelectionHeader ... /> en mode sélection', penseesSrc.includes('<SelectionHeader'));
check('accord féminin correct ("sélectionnée"/"sélectionnées")', penseesSrc.includes('singular="sélectionnée"') && penseesSrc.includes('plural="sélectionnées"'));

console.log('\n[§6 — ContactsScreen.tsx — sélection multiple]');
const contactsSrc = readSrc('screens', 'ContactsScreen.tsx');
check('état selectionMode/selectedIds ajouté', contactsSrc.includes('selectionMode') && contactsSrc.includes('selectedIds'));
check('appui long entre en sélection avec le proche pressé immédiatement sélectionné', contactsSrc.includes('handleRowLongPress') && contactsSrc.includes('new Set([contactId])'));
check('tap hors sélection navigue toujours vers Fiche (comportement normal inchangé)', contactsSrc.includes("navigation.navigate('Fiche', { contactId })"));
check('tap en sélection bascule la sélection (pas de navigation)', contactsSrc.includes('next.delete(contactId)') && contactsSrc.includes('next.add(contactId)'));
check('utilise le SelectionHeader mutualisé avec accord masculin ("sélectionné"/"sélectionnés")', contactsSrc.includes('singular="sélectionné"') && contactsSrc.includes('plural="sélectionnés"'));
check(
  'confirmation utilise contactsDeletionTitle/contactsDeletionMessage (texte pluriel + règle "pensées conservées sans proche")',
  contactsSrc.includes('contactsDeletionTitle(count)') && contactsSrc.includes('contactsDeletionMessage(count, linkedCount)'),
);
check('IMPORTANT : suppression utilise deleteContact existant, UN appel par proche (pas de chemin parallèle)', contactsSrc.includes('selectedIds.forEach((id) => deleteContact(id))'));
check('linkedCount calculé sur les pensées des proches sélectionnés (pour le texte de confirmation)', contactsSrc.includes('pensees.filter((p) => p.contactId && selectedIds.has(p.contactId))'));
check('coche de sélection visible uniquement en mode sélection (même langage visuel que PenseeRow)', contactsSrc.includes("selectionMode && (") && contactsSrc.includes('checkmark-circle'));

console.log('\n[§7 — MemorizedPenseesScreen.tsx — sélection multiple mutualisée]');
const memoSrc = readSrc('screens', 'MemorizedPenseesScreen.tsx');
check('état selectionMode/selectedIds ajouté', memoSrc.includes('selectionMode') && memoSrc.includes('selectedIds'));
check('réutilise PenseeRow (déjà exporté par PenseesScreen) avec selectionMode/selected — pas de deuxième composant carte', memoSrc.includes('selectionMode={selectionMode}') && memoSrc.includes('selected={selectedIds.has(item.pensee.id)}'));
check('appui long entre en sélection avec la pensée pressée immédiatement sélectionnée', memoSrc.includes('handleCardLongPress') && memoSrc.includes('new Set([penseeId])'));
check('suppression utilise deletePensee existant, UN appel par pensée', memoSrc.includes('selectedIds.forEach((id) => deletePensee(id))'));
check('confirmation avant suppression (singulier/pluriel)', memoSrc.includes("count === 1 ? 'Supprimer cette pensée ?'"));
check('utilise le SelectionHeader mutualisé (pas de header divergent)', memoSrc.includes('<SelectionHeader'));
check('recherche/filtre restent affichés hors mode sélection (masqués seulement pendant la sélection)', memoSrc.includes('selectionMode ? (') && memoSrc.includes('styles.searchRow'));

console.log('\n[§8 — MemorizedPenseesScreen.tsx / Screen.tsx — espace remonté sous le header natif]');
check('MemorizedPenseesScreen passe topInset={false} (header natif réserve déjà la safe area du haut)', memoSrc.includes('<Screen scroll={false} topInset={false}>'));
const screenSrc = readSrc('components', 'Screen.tsx');
check('Screen.tsx expose un prop topInset (défaut true — comportement inchangé partout ailleurs)', screenSrc.includes('topInset = true') && screenSrc.includes("edges={topInset ? ['top'] : []}"));
check('recherche + filtre restent horizontalement alignés (même styles.searchRow, pas de refonte)', memoSrc.includes('styles.searchRow'));

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
