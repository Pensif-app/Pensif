// CHANTIER "Mini tutoriel onboarding global" (2026-09-24). tutorial.ts (pur) est exécuté pour de vrai ;
// les composants react-native (TutorialOverlay/TutorialMocks/App.tsx) sont vérifiés par source-grep.
//
// Usage : npx tsx scripts/test-regression-tutorial.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  TUTORIAL_PAGES,
  TUTORIAL_PAGE_COUNT,
  TUTORIAL_SEEN_KEY,
  isLastTutorialPage,
  nextTutorialPage,
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

console.log('\n[Structure] 4 pages, sous-vues internes, jamais de 5e page');
check('exactement 4 pages principales : Accueil / Proches / Pensées / Calendrier', TUTORIAL_PAGE_COUNT === 4 && TUTORIAL_PAGES.map((p) => p.title).join('|') === 'Accueil|Proches|Pensées|Calendrier');
check('Accueil = 1 vue', TUTORIAL_PAGES[0].views.length === 1);
check('Proches, Pensées, Calendrier = 2 vues internes chacune (glissement horizontal)', TUTORIAL_PAGES.slice(1).every((p) => p.views.length === 2));
check('vues Proches : liste + Nouveau proche', TUTORIAL_PAGES[1].views.map((v) => v.mock).join() === 'proches,nouveauProche');
check('vues Pensées : liste + capture vocale', TUTORIAL_PAGES[2].views.map((v) => v.mock).join() === 'pensees,capture');
check('vues Calendrier : Mois + Semaine', TUTORIAL_PAGES[3].views.map((v) => v.mock).join() === 'calendrierMois,calendrierSemaine');
check('bulles numérotées 1..N sans trou dans chaque vue', TUTORIAL_PAGES.every((p) => p.views.every((v) => v.callouts.every((c, i) => c.n === i + 1))));
check('chaque bulle a texte, accent bleu/rose/violet, côté et flèche valides', TUTORIAL_PAGES.every((p) => p.views.every((v) => v.callouts.every((c) => c.text.length > 0 && ['blue', 'pink', 'violet'].includes(c.accent) && ['left', 'right'].includes(c.side) && ['up', 'down', 'left', 'right'].includes(c.arrow) && c.top >= 0 && c.top <= 100))));

console.log('\n[Textes validés]');
const allText = TUTORIAL_PAGES.flatMap((p) => p.views.flatMap((v) => v.callouts.map((c) => c.text))).join('\n');
check('Accueil : « Ta journée commence ici, un aperçu personnel de ce qui compte pour toi aujourd’hui. »', allText.includes('Ta journée commence ici, un aperçu personnel de ce qui compte pour toi aujourd’hui.'));
check('Accueil : blocs AUJOURD’HUI, CETTE SEMAINE, À ANTICIPER et onglet Accueil expliqués', allText.includes('AUJOURD’HUI') && allText.includes('CETTE SEMAINE') && allText.includes('À ANTICIPER') && allText.includes('Accueil : ton tableau de bord'));
check('Capture : « Ta voix sert uniquement à transformer ta capture en pensée. » (formulation prudente, vérifiée par l’audit confidentialité)', allText.includes('Ta voix sert uniquement à transformer ta capture en pensée.'));
check('Capture : aucune promesse non prouvée (supprimé juste après / jamais stocké / reste en sécurité)', !/supprimé juste après|jamais stocké|reste en sécurité/i.test(allText));
check('Proches : import contacts, ajout manuel, quiz, bouton +', allText.includes('depuis tes contacts') && allText.includes('à la main') && allText.includes('Le quiz') && allText.includes('bouton +'));
check('Pensées : classement, filtre par proche, ajout manuel, capture vocale', allText.includes('classées par moment') && allText.includes('Filtre par proche') && allText.includes('à la main') && allText.includes('à la voix'));
check('Calendrier : Mois/Semaine, repères, détail du jour, ajout depuis une date', allText.includes('Vue Mois') && allText.includes('Vue Semaine') && allText.includes('repère') && allText.includes('détail') && allText.includes('depuis une date'));

console.log('\n[Navigation] Continuer / Passer / pagination');
check('nextTutorialPage : 0→1→2→3, puis null (fin)', nextTutorialPage(0) === 1 && nextTutorialPage(1) === 2 && nextTutorialPage(2) === 3 && nextTutorialPage(3) === null);
check('isLastTutorialPage seulement à l’index 3', !isLastTutorialPage(0) && !isLastTutorialPage(2) && isLastTutorialPage(3));
check('libellé "Continuer >" sur les 3 premières pages, "Terminer" sur la dernière', tutorialContinueLabel(0) === 'Continuer >' && tutorialContinueLabel(2) === 'Continuer >' && tutorialContinueLabel(3) === 'Terminer');

console.log('\n[One-shot] shouldShowTutorial');
const base = { seen: false as boolean | null, ready: true, authGateNone: true, hasUserName: true, namePromptOpen: false, hasData: false };
check('nouvel utilisateur (flag absent, prénom saisi, aucune donnée) → affiché', shouldShowTutorial(base) === true);
check('déjà vu → jamais réaffiché', shouldShowTutorial({ ...base, seen: true }) === false);
check('flag pas encore lu (null) → jamais affiché (pas de flash)', shouldShowTutorial({ ...base, seen: null }) === false);
check('store pas prêt → non', shouldShowTutorial({ ...base, ready: false }) === false);
check('auth gate encore affiché → non', shouldShowTutorial({ ...base, authGateNone: false }) === false);
check('prénom pas encore saisi ou modale prénom ouverte → non (jamais par-dessus la modale prénom)', shouldShowTutorial({ ...base, hasUserName: false }) === false && shouldShowTutorial({ ...base, namePromptOpen: true }) === false);
check('utilisateur déjà installé (données présentes) → non', shouldShowTutorial({ ...base, hasData: true }) === false);
check('clé de persistance pensif.tutorialSeen', TUTORIAL_SEEN_KEY === 'pensif.tutorialSeen');

console.log('\n[Câblage] TutorialOverlay / TutorialGate / App.tsx');
const overlay = read('src', 'components', 'TutorialOverlay.tsx');
const mocks = read('src', 'components', 'TutorialMocks.tsx');
const app = read('App.tsx');
check('footer : « Passer le tutoriel » quitte tout (onPress={onDone})', /onPress=\{onDone\}[\s\S]{0,200}Passer le tutoriel/.test(overlay));
check('footer : « Continuer > » via onContinue → page suivante, ou fin sur la dernière', /const next = nextTutorialPage\(page\);\s*if \(next === null\) onDone\(\);\s*else goTo\(next\);/.test(overlay) && /tutorialContinueLabel\(page\)/.test(overlay));
check('pagination globale = 4 points (TUTORIAL_PAGE_COUNT)', /Array\.from\(\{ length: TUTORIAL_PAGE_COUNT \}/.test(overlay));
check('sous-vues : ScrollView horizontal paginé + indice de glissement (chevron à droite)', /horizontal\s+pagingEnabled/.test(overlay) && overlay.includes('name="chevron-forward"') && overlay.includes('styles.swipeHint'));
check('flag écrit (AsyncStorage.setItem TUTORIAL_SEEN_KEY) à la fin ET au "Passer"', /AsyncStorage\.setItem\(TUTORIAL_SEEN_KEY, '1'\)/.test(overlay) && /<TutorialOverlay onDone=\{markSeen\} \/>/.test(overlay));
check('overlay plein écran (absoluteFill) sur fond dégradé sombre', /StyleSheet\.absoluteFill/.test(overlay) && overlay.includes('LinearGradient'));
check('App.tsx monte <TutorialGate /> (sibling de RootNavigator, après AuthGate)', app.includes('<TutorialGate />') && app.indexOf('<AuthGateScreen />') < app.indexOf('<TutorialGate />'));
check('néon bleu/rose/violet définis', /blue: '#4CC9FF'/.test(mocks) && /pink: '#FF5CAA'/.test(mocks) && /violet: '#9B7CFF'/.test(mocks));
check('maquettes à données fictives, jamais useStore dans TutorialMocks', !mocks.includes('useStore'));
check('aucun nouveau package (expo-linear-gradient/AsyncStorage/Ionicons déjà présents)', JSON.parse(read('package.json')).dependencies['expo-linear-gradient'] !== undefined);

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
