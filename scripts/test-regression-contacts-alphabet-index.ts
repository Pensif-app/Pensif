// Tests de non-régression — CHANTIER "Index alphabétique Proches" (2026-09-27, VALIDÉ
// PHYSIQUEMENT : Favoris→W/A/M, W→A→M→W, puis tap unique + drag A↔Z). Exécute RÉELLEMENT les
// fonctions PURES de src/data/contactsAlphabetIndex.ts (letterFromScreenY, resolveAlphaSection,
// resolveTargetY, ALPHABET), extraites de ContactsScreen.tsx spécifiquement pour être chargeables
// sous tsx (le composant react-native lui-même ne l'est pas, même constat que les chantiers
// précédents).
//
// Historique complet (voir commentaires dans ContactsScreen.tsx/contactsAlphabetIndex.ts) :
//   1. `scrollToLocation()` peu fiable sur device (retombait dans les Favoris, y compris avec des
//      indices codés en dur) ;
//   2. 1ère tentative de mesure (`measureLayout`/`getInnerViewNode`/`findNodeHandle`) a planté au
//      runtime ("ref.measureLayout must be called with a ref to a native component") ;
//   3. moteur final : `measureInWindow` + `getScrollResponder().scrollTo({y})`, validé
//      physiquement dans les deux sens ;
//   4. dernier bug : le tap initial utilisait `nativeEvent.locationY` (relatif à l'enfant `<Text>`
//      touché, pas à toute la barre) — remplacé par `letterFromScreenY` : une coordonnée écran
//      absolue (`gestureState.y0`/`moveY`) + la géométrie RÉELLEMENT MESURÉE du wrapper A-Z entier.
// Le moteur de scroll (mesure des headers, ScrollResponder) n'est pas exécutable ici (react-native)
// — vérifié par lecture de code (§6) ; ce fichier couvre ce qui est testable en isolation : la
// géométrie tactile (tap ET drag, même fonction) et les deux résolutions (lettre -> section,
// lettre+offsets -> Y cible).
//
// Usage : npx tsx scripts/test-regression-contacts-alphabet-index.ts

import * as fs from 'fs';
import * as path from 'path';
import { ALPHABET, letterFromScreenY, resolveAlphaSection, resolveTargetY } from '../src/data/contactsAlphabetIndex';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] Géométrie tactile — pageY=100, height=260 (10px/lettre), tap ET drag même fonction');
const geometry = { pageY: 100, height: 260 }; // 260 / 26 = 10px par lettre
check('screenY=100 (tout en haut du wrapper) -> A', letterFromScreenY(100, geometry) === 'A');
check('screenY=105 (encore dans la tranche de A) -> A', letterFromScreenY(105, geometry) === 'A');
check('screenY=110 (tranche suivante) -> B', letterFromScreenY(110, geometry) === 'B');
check('screenY=220 (milieu, tranche de M) -> M', letterFromScreenY(220, geometry) === 'M');
check('screenY=359.9 (tout en bas du wrapper) -> Z', letterFromScreenY(359.9, geometry) === 'Z');
check('au-dessus du wrapper (screenY=0) -> clampé à A', letterFromScreenY(0, geometry) === 'A');
check('sous le wrapper (screenY=10000) -> clampé à Z', letterFromScreenY(10000, geometry) === 'Z');
check('géométrie non mesurée (height<=0) -> null, jamais une lettre au hasard', letterFromScreenY(150, { pageY: 0, height: 0 }) === null);
check('changement de lettre uniquement quand la frontière est réellement franchie (109 encore A, pas B)', letterFromScreenY(109, geometry) === 'A');

console.log('\n[2] Résolution lettre -> section (Favoris exclus du mapping, voir alphaSections)');
type Section = { title: string; favorites?: boolean };
// Reproduit exactement la forme réelle : Favoris + A, C, M, W (B, D..L, N..V, X, Y, Z absents).
const allSections: Section[] = [
  { title: 'Favoris', favorites: true },
  { title: 'A' },
  { title: 'C' },
  { title: 'M' },
  { title: 'W' },
];
const alphaSections = allSections.filter((s) => !s.favorites);

check('A -> section A (présente)', resolveAlphaSection(alphaSections, 'A')?.title === 'A');
check('B (absente) -> prochaine lettre disponible C', resolveAlphaSection(alphaSections, 'B')?.title === 'C');
check('M -> section M (présente)', resolveAlphaSection(alphaSections, 'M')?.title === 'M');
check('W -> section W (présente)', resolveAlphaSection(alphaSections, 'W')?.title === 'W');
check('Z (absente, aucune lettre après) -> dernière disponible W', resolveAlphaSection(alphaSections, 'Z')?.title === 'W');

console.log('\n[3] INVARIANT — aucune lettre A-Z ne doit jamais résoudre vers Favoris');
const neverFavorites = ALPHABET.every((letter) => resolveAlphaSection(alphaSections, letter)?.title !== 'Favoris');
check('les 26 lettres A-Z ne résolvent jamais vers "Favoris"', neverFavorites);

console.log('\n[4] Aucune section alphabétique (tous favoris, ou aucun proche) -> undefined, jamais un crash ni un index 0 implicite');
check('alphaSections vide -> undefined (pas de fallback vers une section arbitraire)', resolveAlphaSection([], 'W') === undefined);

console.log('\n[5] Résolution lettre + offsets mesurés -> Y cible, jamais 0 par défaut');
const offsets: Record<string, number> = { A: 400, M: 2200, W: 4300 };
check('A -> 400 (offset mesuré réel)', resolveTargetY(alphaSections, 'A', offsets) === 400);
check('M -> 2200 (offset mesuré réel)', resolveTargetY(alphaSections, 'M', offsets) === 2200);
check('W -> 4300 (offset mesuré réel)', resolveTargetY(alphaSections, 'W', offsets) === 4300);
check('B (absente) -> offset de C (prochaine disponible), pas 0', resolveTargetY(alphaSections, 'B', offsets) === undefined /* C absente d'`offsets` ici */);
const offsetsWithC: Record<string, number> = { A: 400, C: 1200, M: 2200, W: 4300 };
check('B (absente) -> offset de C quand C est mesurée', resolveTargetY(alphaSections, 'B', offsetsWithC) === 1200);
check('section non encore mesurée -> undefined, JAMAIS 0', resolveTargetY(alphaSections, 'W', {}) === undefined);
check('aucune section alphabétique -> undefined', resolveTargetY([], 'W', offsets) === undefined);

console.log('\n[6] Correctif final (géométrie écran + moteur à offsets mesurés) — lecture de code (non exécutable ici, react-native)');
const contactsScreenSrc = fs
  .readFileSync(path.join(__dirname, '..', 'src', 'screens', 'ContactsScreen.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
check(
  'AlphabetIndex resynchronise onSelectLetter via une ref à CHAQUE rendu (onSelectLetterRef.current = onSelectLetter) — corrige la closure figée de useRef(PanResponder.create(...))',
  contactsScreenSrc.includes('const onSelectLetterRef = useRef(onSelectLetter);') &&
    contactsScreenSrc.includes('onSelectLetterRef.current = onSelectLetter;'),
);
check(
  // "nativeEvent.locationY" reste mentionné dans un commentaire narratif (cause du bug corrigé) —
  // on vérifie qu'il n'est plus jamais LU/APPELÉ dans le code, pas son absence totale du fichier.
  'le tap initial (grant) utilise gestureState.y0 (coordonnée écran absolue), JAMAIS nativeEvent.locationY (relatif à l’enfant touché — cause du dernier bug)',
  contactsScreenSrc.includes('handleTouch(gestureState.y0)') && !contactsScreenSrc.includes('.nativeEvent.locationY'),
);
check(
  'le drag (move) utilise gestureState.moveY — même fonction handleTouch que le tap initial',
  contactsScreenSrc.includes('handleTouch(gestureState.moveY)'),
);
check(
  'la géométrie A-Z est remesurée et l’état tactile réinitialisé à chaque gain de focus (régression "visible mais non-interactif après retour sur Proches", 2026-09-28)',
  contactsScreenSrc.includes('setAlphabetIndexFocusVersion((v) => v + 1);') &&
    contactsScreenSrc.includes('focusVersion={alphabetIndexFocusVersion}') &&
    contactsScreenSrc.includes('const raf = requestAnimationFrame(() => measureAlphabetGeometry());') &&
    /useEffect\(\(\) => \{\s*lastNavigatedLetterRef\.current = null;/.test(contactsScreenSrc),
);
check(
  'la géométrie du wrapper A-Z est mesurée via measureInWindow (jamais une hauteur de police/lineHeight supposée)',
  contactsScreenSrc.includes('alphabetIndexRef.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => {') &&
    contactsScreenSrc.includes('alphabetGeometryRef.current = { pageY: y, height };'),
);
check(
  'la mesure est rafraîchie via onLayout du wrapper (signal, measureInWindow reste la source de vérité — jamais nativeEvent.layout.y directement)',
  contactsScreenSrc.includes('onLayout={measureAlphabetGeometry}') && !contactsScreenSrc.includes('nativeEvent.layout.y'),
);
check(
  'navigateToAlphabetLetter utilise resolveAlphaSection (jamais sections/favoris directement pour le mapping)',
  contactsScreenSrc.includes('const resolvedSection = resolveAlphaSection(alphaSections, letter);'),
);
check(
  'navigateToAlphabetLetter utilise resolveTargetY (offset mesuré)',
  contactsScreenSrc.includes('resolveTargetY(alphaSections, letter, sectionOffsetByTitleRef.current)'),
);
check(
  'navigateToAlphabetLetter utilise getScrollResponder().scrollTo (pas scrollToLocation)',
  contactsScreenSrc.includes('responder?.scrollTo?.({ y: Math.max(0, targetY), animated: false });'),
);
check(
  'la mesure des headers utilise measureInWindow (measureLayout/findNodeHandle/getInnerViewNode ne sont plus appelés)',
  contactsScreenSrc.includes('headerNode.measureInWindow((_headerX: number, headerWindowY: number) => {') &&
    !contactsScreenSrc.includes('.measureLayout(') &&
    !contactsScreenSrc.includes('findNodeHandle(') &&
    !contactsScreenSrc.includes('.getInnerViewNode('),
);
check(
  'une mesure de header déjà connue pour un titre n’est jamais écrasée',
  contactsScreenSrc.includes("if (typeof sectionOffsetByTitleRef.current[title] === 'number') return;"),
);
check(
  'aucun repli vers 0/Favoris quand l’offset est absent : return explicite avant tout scroll',
  contactsScreenSrc.includes("if (typeof targetY !== 'number') return;"),
);
check(
  'le drag continu ignore une lettre déjà ciblée (lastNavigatedLetterRef), remis à zéro en fin de geste',
  contactsScreenSrc.includes('const lastNavigatedLetterRef = useRef<string | null>(null);') &&
    contactsScreenSrc.includes('if (!resolvedLetter || resolvedLetter === lastNavigatedLetterRef.current) return;'),
);
check(
  'AlphabetIndex est la SEULE source de navigateToAlphabetLetter — aucun diagnostic/bouton résiduel, aucun haptique ajouté',
  contactsScreenSrc.includes('onSelectLetter={navigateToAlphabetLetter}') &&
    (contactsScreenSrc.match(/navigateToAlphabetLetter\(/g) ?? []).length === 1 &&
    !contactsScreenSrc.toLowerCase().includes('haptic'),
);
check(
  'plus aucun APPEL à scrollToLocation/scrollToOffset/scrollToEnd, plus de onScrollToIndexFailed/lastJumpRef/logs temporaires (diagnostic "[AZ ...]" retiré, régression confirmée corrigée)',
  !contactsScreenSrc.includes('.scrollToLocation(') &&
    !contactsScreenSrc.includes('.scrollToOffset(') &&
    !contactsScreenSrc.includes('.scrollToEnd(') &&
    !contactsScreenSrc.includes('onScrollToIndexFailed') &&
    !contactsScreenSrc.includes('lastJumpRef') &&
    !contactsScreenSrc.includes('console.log('),
);
check(
  // RÉGRESSION (2026-09-28) : l'invalidation seule (vidage de la map) ne suffisait pas — rien ne
  // redéclenchait de mesure ensuite tant qu'on restait sur Proches (headers déjà montés dont
  // `onLayout` ne se redéclenche pas forcément). Le vidage doit maintenant être TOUJOURS suivi
  // d'une remesure programmée (double rAF -> remeasureAlphabetSections), jamais laissé "à vide"
  // en attendant un hypothétique futur onLayout.
  'l’invalidation des offsets (changement de sections) est TOUJOURS suivie d’une remesure explicite programmée — jamais un simple vidage sans suite',
  /sectionOffsetByTitleRef\.current = \{\};[\s\S]{0,400}requestAnimationFrame\(\(\) => \{[\s\S]{0,200}requestAnimationFrame\(\(\) => \{[\s\S]{0,100}remeasureAlphabetSections\(\);/.test(
    contactsScreenSrc,
  ) && contactsScreenSrc.includes('}, [sections]);'),
);
check(
  'remeasureAlphabetSections nettoie les refs/offsets des lettres disparues (ex. dernier proche d’une lettre supprimé) avant de remesurer les headers encore montés',
  contactsScreenSrc.includes('if (!validTitles.has(title)) delete sectionHeaderNodesRef.current[title];') &&
    contactsScreenSrc.includes('if (!validTitles.has(title)) delete sectionOffsetByTitleRef.current[title];'),
);
check(
  'remeasureAlphabetSections utilise la MÊME géométrie que measureSectionHeader (measureInWindow + listViewportRef + currentScrollYRef) — pas un calcul divergent',
  contactsScreenSrc.includes(
    'sectionOffsetByTitleRef.current[title] = currentScrollYRef.current + (headerWindowY - listWindowY);',
  ),
);
check(
  'la remesure est déclenchée par un changement de `sections` (donc aussi par un ajout/retrait de Favori, qui change la hauteur de la section Favoris et décale tout ce qui suit) — pas seulement `contacts`',
  contactsScreenSrc.includes('}, [sections]);') && !/\}, \[contacts\]\);[\s\S]{0,50}remeasureAlphabetSections/.test(contactsScreenSrc),
);

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
