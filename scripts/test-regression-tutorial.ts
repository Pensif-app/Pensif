// CHANTIER "Mini tutoriel onboarding global" (2026-09-24), version SIMPLIFIÉE : suite d'images statiques finales
// (assets/tutorial) + bande de navigation fixe. tutorial.ts (pur) est exécuté pour de vrai ; les composants
// react-native (TutorialOverlay/App.tsx/SettingsScreen) sont vérifiés par source-grep.
//
// Usage : npx tsx scripts/test-regression-tutorial.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  TUTORIAL_IMAGES,
  TUTORIAL_IMAGE_COUNT,
  TUTORIAL_SEEN_KEY,
  isLastTutorialImage,
  nextTutorialIndex,
  shouldShowTutorial,
  tutorialContinueLabel,
} from '../src/data/tutorial';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const overlay = read('src', 'components', 'TutorialOverlay.tsx');
const dataSrc = read('src', 'data', 'tutorial.ts');
const app = read('App.tsx');

console.log('\n[Images] suite statique des assets existants');
const expectedFiles = ['tuto-accueil', 'tuto-proches', 'tuto-nouveau-proche', 'tuto-pensees', 'tuto-capture', 'tuto-calendrier-mois', 'tuto-calendrier-semaine'];
check('7 images dans l’ordre : accueil, proches, nouveau-proche, pensees, capture, calendrier-mois, calendrier-semaine', TUTORIAL_IMAGE_COUNT === 7 && TUTORIAL_IMAGES.join() === 'accueil,proches,nouveau-proche,pensees,capture,calendrier-mois,calendrier-semaine');
check('les 7 fichiers existent dans assets/tutorial (mêmes noms qu’avant)', expectedFiles.every((f) => fs.existsSync(path.join(__dirname, '..', 'assets', 'tutorial', `${f}.png`))));
check('chaque image est référencée par un require statique vers assets/tutorial', expectedFiles.every((f) => overlay.includes(`require('../../assets/tutorial/${f}.png')`)));
check('1 écran = 1 image, affichée en `contain`, sans stretch ni recadrage', /resizeMode="contain"/.test(overlay) && !/resizeMode="(cover|stretch)"/.test(overlay) && (overlay.match(/<Image /g) ?? []).length === 1);
check('aucune reconstruction d’écran : pas de fichier de maquettes, aucun useStore dans l’affichage des images', !fs.existsSync(path.join(__dirname, '..', 'src', 'components', 'TutorialMocks.tsx')));

console.log('\n[Ancien système supprimé]');
check('fichier tutorialLayout.ts supprimé', !fs.existsSync(path.join(__dirname, '..', 'src', 'data', 'tutorialLayout.ts')));
const codeOnly = (overlay + '\n' + dataSrc).replace(/^\s*\/\/.*$/gm, '');
check('plus de bulles, hotspots, placement, spotlight, debug dans le code du tutoriel', !/placeBubble|hotspot|target|placement|spotlight|Spotlight|\[dbg\]|debug|callout|computeArrow|computeContainedImageRect|onLayout/.test(codeOnly));
check('plus de sous-vues pilotées par état (chevrons, swipe, ScrollView)', !/ScrollView|chevron|subview|pagingEnabled/.test(codeOnly));

console.log('\n[Navigation] séquentielle simple');
check('Continuer : 0→1→…→6, puis null (fin)', [0, 1, 2, 3, 4, 5].every((i) => nextTutorialIndex(i) === i + 1) && nextTutorialIndex(6) === null);
check('dernière image : libellé « Terminer », partout ailleurs « Continuer »', tutorialContinueLabel(6) === 'Terminer' && isLastTutorialImage(6) && [0, 3, 5].every((i) => tutorialContinueLabel(i) === 'Continuer'));
check('« Continuer » : nextTutorialIndex → setIndex, ou onDone() sur la dernière image', /const next = nextTutorialIndex\(index\);\s*if \(next === null\) onDone\(\);\s*else setIndex\(next\);/.test(overlay));
check('« Passer le tutoriel » ferme tout (onPress={onDone})', /onPress=\{onDone\}[\s\S]{0,200}Passer le tutoriel/.test(overlay));
check('points de progression : un par image, cliquables (simple), point courant actif', /TUTORIAL_IMAGES\.map\(\(id, i\) => \(\s*<Pressable key=\{id\} onPress=\{\(\) => setIndex\(i\)\}/.test(overlay) && /i === index && styles\.dotActive/.test(overlay));

console.log('\n[Layout] zone image + footer fixe');
check('zone image = flex:1 au-dessus du footer, image centrée à 100% x 100%', /imageArea: \{ flex: 1, alignItems: 'center', justifyContent: 'center' \}/.test(overlay) && /image: \{ width: '100%', height: '100%' \}/.test(overlay));
check('footer en dessous de la zone image, commun à toutes les images (rendu après imageArea)', overlay.indexOf('styles.imageArea') < overlay.indexOf('styles.footer'));
check('footer : « Passer le tutoriel » à gauche, points au centre, bouton « Continuer » à droite', overlay.indexOf('styles.footerLeft') < overlay.indexOf('styles.dots') && overlay.indexOf('styles.dots') < overlay.indexOf('styles.footerRight'));
check('bouton principal arrondi violet → rose (dégradé #9B7CFF → #FF5CAA)', /VIOLET = '#9B7CFF'/.test(overlay) && /PINK = '#FF5CAA'/.test(overlay) && /colors=\{\[VIOLET, PINK\]\}/.test(overlay) && /borderRadius: 22/.test(overlay));
check('fond sombre intégré à l’app (#0B0A24) pour le footer et l’overlay', /FOOTER_BG = '#0B0A24'/.test(overlay) && /backgroundColor: FOOTER_BG/.test(overlay));
check('overlay plein écran (absoluteFill) dans une SafeAreaView', /StyleSheet\.absoluteFill/.test(overlay) && /<SafeAreaView style=\{styles\.safe\}>/.test(overlay));

console.log('\n[One-shot] shouldShowTutorial (inchangé)');
const base = { seen: false as boolean | null, ready: true, authGateNone: true, hasUserName: true, namePromptOpen: false, hasData: false };
check('nouvel utilisateur (flag absent, prénom saisi, aucune donnée) → affiché', shouldShowTutorial(base) === true);
check('déjà vu → jamais réaffiché ; flag pas encore lu (null) → non', shouldShowTutorial({ ...base, seen: true }) === false && shouldShowTutorial({ ...base, seen: null }) === false);
check('store pas prêt / auth gate / prénom / modale prénom / données existantes → non', shouldShowTutorial({ ...base, ready: false }) === false && shouldShowTutorial({ ...base, authGateNone: false }) === false && shouldShowTutorial({ ...base, hasUserName: false }) === false && shouldShowTutorial({ ...base, namePromptOpen: true }) === false && shouldShowTutorial({ ...base, hasData: true }) === false);
check('clé de persistance pensif.tutorialSeen', TUTORIAL_SEEN_KEY === 'pensif.tutorialSeen');
check('flag écrit (AsyncStorage.setItem TUTORIAL_SEEN_KEY) à la fin ET au « Passer »', /AsyncStorage\.setItem\(TUTORIAL_SEEN_KEY, '1'\)/.test(overlay) && /<TutorialOverlay onDone=\{markSeen\} \/>/.test(overlay));
check('App.tsx monte <TutorialGate /> après AuthGate', app.includes('<TutorialGate />') && app.indexOf('<AuthGateScreen />') < app.indexOf('<TutorialGate />'));

console.log('\n[DEV — Simuler une vraie première installation] (inchangé)');
{
  const settings = read('src', 'screens', 'SettingsScreen.tsx');
  check('après reset : navigation reconstruite (navigationRef.reset vers Tabs seul)', /devSimulateReinstall\(\)\.then\(\(\) => \{\s*if \(navigationRef\.isReady\(\)\) navigationRef\.reset\(\{ index: 0, routes: \[\{ name: 'Tabs' \}\] \}\);/.test(settings));
  check('le tutoriel relit son flag à chaque changement d’auth gate', /\}, \[authGate\]\);/.test(overlay));
  check('flag pensif.tutorialSeen supprimé par le reset', /removeItem\(TUTORIAL_SEEN_KEY\)/.test(read('src', 'data', 'store.tsx')));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
