// Vérifications structurelles — CHANTIER QUIZ MODIFIABLE (rendre le quiz d'un proche modifiable
// après complétion). Complète test-regression-quiz-editable.ts (logique pure) là où
// FicheScreen.tsx/QuizScreen.tsx importent react-native/expo et ne peuvent pas être chargés sous
// ts-node. Script autonome (Node pur, comme check-taxonomy-integrity.js) — lecture seule.
//
// Usage : node scripts/check-quiz-editable.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] FicheScreen : le quiz reste ouvrable qu’il soit fait ou non, une action accessible existe toujours vers Quiz');
const fiche = read('src/screens/FicheScreen.tsx');
const quizCardBlock = fiche.slice(fiche.indexOf('<QuizSummaryCard'), fiche.indexOf('<QuizSummaryCard') + 400);
check(
  'QuizSummaryCard mène vers Quiz sans condition sur isQuizComplete (action toujours accessible, même quiz complété)',
  /onPress=\{\(\) => navigation\.(push|navigate)\('Quiz', \{[\s\S]{0,80}contactId: existing\.id/.test(quizCardBlock),
  quizCardBlock,
);
check('CTA "Modifier le portrait" affiché quand le quiz est déjà fait', /Modifier le portrait/.test(fiche));

console.log('\n[1b] BUG RÉEL CORRIGÉ (1/2) : push (pas navigate) — sinon une instance Quiz déjà présente dans la pile');
console.log('     (ex. après "Voir ses idées cadeaux" qui empile Cadeaux sans dépiler Quiz) est simplement');
console.log('     refocalisée, figée à son ancien step, au lieu de remonter un flux de questions éditable.');
check(
  'navigation.push(\'Quiz\', ...) utilisé depuis la fiche (jamais navigate, qui peut réutiliser une instance figée)',
  /onPress=\{\(\) => navigation\.push\('Quiz', \{[\s\S]{0,80}contactId: existing\.id/.test(quizCardBlock),
);

console.log('\n[1c] BUG RÉEL CORRIGÉ (2/2) : mode: \'edit\' passé quand le quiz est déjà complété');
console.log('     (push seul ne suffit pas si un brouillon résiduel figé sur les résultats existe — voir [7]).');
check(
  'mode: isQuizComplete(existing.quiz) ? \'edit\' : \'default\' présent sur cet appel',
  /mode:\s*isQuizComplete\(existing\.quiz\)\s*\?\s*'edit'\s*:\s*'default'/.test(quizCardBlock),
  quizCardBlock,
);

console.log('\n[2] QuizScreen : les réponses existantes sont préremplies, jamais réinitialisées');
const quiz = read('src/screens/QuizScreen.tsx');
check('answers initialisé depuis contact?.quiz?.answers', /useState<QuizAnswer\[\]>\(contact\?\.quiz\?\.answers \?\? \[\]\)/.test(quiz));

console.log('\n[3] answerQuestion ne tronque plus les réponses suivantes (bug corrigé)');
check('plus de `answers.slice(0, step)` (tronquait tout après la question modifiée)', !/answers\.slice\(0, step\)/.test(quiz));
check('remplace par index (next[answeredStep] = choice / next[step] = choice)', /next\[(answeredStep|step)\] = choice/.test(quiz));

console.log('\n[4] La réponse déjà enregistrée est restaurée visuellement en revenant sur une question');
check('un effet resynchronise `flash` depuis `answers[step]`', /setFlash\(\(answers\[step\][\s\S]{0,30}\?\? null\)/.test(quiz));

console.log('\n[5] finish() remplace proprement contact.quiz (pas de second quiz, métadonnées conservées)');
const finishBlock = quiz.slice(quiz.indexOf('const finish = ()'), quiz.indexOf('const progress ='));
check('un seul upsertContact, avec quiz: {...} (remplacement, pas une liste/tableau de quiz)', /upsertContact\(\{[\s\S]*quiz: \{/.test(finishBlock));
check('feedback existant conservé (pas réinitialisé)', /feedback: contact\.quiz\?\.feedback \?\? \[\]/.test(finishBlock));
check('recommendationHistory existant conservé (pas réinitialisé)', /recommendationHistory: contact\.quiz\?\.recommendationHistory \?\? \[\]/.test(finishBlock));
check('budget existant conservé (pas réinitialisé)', /budget: contact\.quiz\?\.budget \?\? null/.test(finishBlock));

console.log('\n[6] Écran résultat ("Profil terminé") : bouton "Refaire le quiz" visible, entre Cadeaux et Retour, via push + mode: edit');
const resultsBlock = quiz.slice(quiz.indexOf('function ResultsStep'), quiz.indexOf('const styles = StyleSheet.create'));
check('libellé "Refaire le quiz" présent', /Refaire le quiz/.test(resultsBlock));
check(
  'utilise navigation.push (jamais navigate) pour rouvrir Quiz — jamais l’instance résultat actuelle',
  /onPress=\{\(\) => navigation\.push\('Quiz', \{ contactId: contact\.id, mode: 'edit' \}\)\}/.test(resultsBlock),
  'attendu : navigation.push(\'Quiz\', { contactId: contact.id, mode: \'edit\' })',
);
check(
  'placé sous "Voir ses idées cadeaux" et au-dessus de "Retour à la fiche"',
  (() => {
    const gifts = resultsBlock.indexOf('Voir ses idées cadeaux');
    const refaire = resultsBlock.indexOf('Refaire le quiz');
    const retour = resultsBlock.indexOf('Retour à la fiche');
    return gifts !== -1 && refaire !== -1 && retour !== -1 && gifts < refaire && refaire < retour;
  })(),
);
check('style secondaire (bordé, pas PrimaryButton) — cohérent avec le reste de l’app', /secondaryBtn/.test(resultsBlock));

console.log('\n[7] BUG RÉEL — CAUSE EXACTE : le brouillon auto-enregistré ne doit plus jamais figer/relire un `step` de résultats');
check(
  'navigation/types.ts : Quiz accepte `mode?: \'default\' | \'edit\'`',
  /Quiz:\s*\{\s*contactId:\s*string;\s*mode\?:\s*'default'\s*\|\s*'edit'\s*\}/.test(read('src/navigation/types.ts')),
);
check('QuizScreen lit `route.params.mode` (défaut \'default\')', /const mode = route\.params\.mode \?\? 'default'/.test(quiz));
check(
  'chargement du brouillon IGNORÉ en mode edit (jamais de step résiduel rechargé)',
  /if \(!draftKey \|\| mode === 'edit'\) \{/.test(quiz),
);
check(
  'sauvegarde du brouillon désactivée dès que `step >= STEP_RESULTS` (jamais persister un état "résultats" comme reprenable)',
  /isEmpty \|\| step >= STEP_RESULTS/.test(quiz),
);

console.log('\n[8] BUG RÉEL — en mode edit, une réponse existante n’est jamais "verrouillée" (tap toujours actif)');
check(
  'un état dédié `isTransitioning` existe, distinct de `flash`',
  /const \[isTransitioning, setIsTransitioning\] = useState\(false\)/.test(quiz),
);
check(
  'answerQuestion vérifie `isTransitioning`, jamais `flash` (qui est aussi vrai pour une réponse déjà affichée)',
  /if \(isTransitioning\) return;/.test(quiz) && !/if \(flash\) return;/.test(quiz),
);
check('answerQuestion pose `isTransitioning` à true au tap, false une fois la transition terminée', /setIsTransitioning\(true\)/.test(quiz) && /setIsTransitioning\(false\)/.test(quiz));

console.log(`\n${failures === 0 ? 'TOUTES LES VÉRIFICATIONS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) process.exit(1);
