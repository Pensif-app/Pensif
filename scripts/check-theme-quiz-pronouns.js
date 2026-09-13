// Vérification structurelle — fix pronom genré dans l'affinage par thème (voyage, lecture, sport,
// auto, nature, cinéma, art, bien-être, animaux, photo, jardinage, bricolage, danse…). Plusieurs
// prompts/options de themeQuizzes.ts codaient en dur "Il" au lieu du jeton {Il}/{il} (voir
// formatQuizText, quiz.ts), donc un contact avec genre=femme voyait quand même "Il" au lieu de
// "Elle". Complète le fix : garantit qu'aucun texte de themeQuizzes.ts ne recode plus jamais un
// pronom en dur, et que ThemeAffinage.tsx applique bien formatQuizText aux labels d'options (pas
// seulement au prompt de la question). Script autonome (Node pur) — lecture seule, ne modifie rien.
//
// Usage : node scripts/check-theme-quiz-pronouns.js

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

console.log('\n[1] Plus aucun pronom "Il" codé en dur (hors jeton {Il}) dans les prompts/labels de themeQuizzes.ts');
const themeQuizzes = read('src/data/themeQuizzes.ts');
const hardcodedPrompt = /prompt:\s*'Il\s/.exec(themeQuizzes);
const hardcodedLabel = /label:\s*'Il\s/.exec(themeQuizzes);
check('aucun `prompt: \'Il ...\'` en dur', !hardcodedPrompt, hardcodedPrompt ? hardcodedPrompt[0] : undefined);
check('aucun `label: \'Il ...\'` en dur', !hardcodedLabel, hardcodedLabel ? hardcodedLabel[0] : undefined);

console.log('\n[2] Le cas réflexif "lui-même" (auto/diy) utilise bien le jeton {lui}, pas un "lui" figé');
check('"{Il} bricole sa voiture {lui}-même ?" présent', /\{Il\} bricole sa voiture \{lui\}-même \?/.test(themeQuizzes));

console.log('\n[3] ThemeAffinage.tsx applique formatQuizText aux labels d’options (pas seulement au prompt)');
const themeAffinage = read('src/components/quiz/ThemeAffinage.tsx');
const labelUsages = themeAffinage.match(/label=\{[^}]*opt\.label[^}]*\}/g) ?? [];
check('au moins 2 usages de label={...opt.label...} trouvés (choix simple + choix multiple)', labelUsages.length >= 2, labelUsages.join(' | '));
check('tous passent par formatQuizText(opt.label, contact)', labelUsages.every((u) => /formatQuizText\(opt\.label,\s*contact\)/.test(u)), labelUsages.join(' | '));

console.log(`\n${failures === 0 ? 'TOUTES LES VÉRIFICATIONS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) process.exit(1);
