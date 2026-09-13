// Vérification structurelle — BUG AM/PM ANDROID (PenseeDetailScreen). Le TimePickerDialog natif
// Android suit le format système (12h/24h) sauf si `is24Hour` est passé explicitement au composant
// JSX <DateTimePicker mode="time" ...> réellement rendu — jamais à un composant inutilisé ni via une
// API impérative (ce fichier n'en utilise aucune). Complète test-regression-reminder-date.ts (qui
// couvre la fusion pure, non concernée par ce bug). Script autonome (Node pur) — lecture seule.
//
// Usage : node scripts/check-pensee-time-24h.js

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

const screen = read('src/screens/PenseeDetailScreen.tsx');

console.log('\n[1] Le picker heure Android réellement rendu force is24Hour');
const timePickerLine = (screen.match(/<DateTimePicker[^>]*mode="time"[^>]*\/>/g) || [])[0] || '';
check('un <DateTimePicker mode="time" ...> existe dans le fichier', Boolean(timePickerLine), timePickerLine || '(introuvable)');
check('ce même élément porte is24Hour (prop présente, jamais sur un autre composant)', /is24Hour/.test(timePickerLine), timePickerLine);
check('pas d’API impérative DateTimePickerAndroid.open (is24Hour serait alors ailleurs)', !/DateTimePickerAndroid\.open/.test(screen));

console.log('\n[2] Le champ affiché utilise HH:mm (24h, séparateur ":"), jamais un format 12h/AM-PM');
check('timeStr construit avec ":" (HH:mm)', /timeStr = `\$\{String\(d\.getHours\(\)\)\.padStart\(2, '0'\)\}:\$\{String\(d\.getMinutes\(\)\)\.padStart\(2, '0'\)\}`/.test(screen));
// Retire tout commentaire (// ligne entière, /* bloc */, y compris {/* JSX */}) avant de chercher
// une trace de logique 12h/AM-PM dans le CODE lui-même.
const codeOnly = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('aucune logique 12h/AM-PM dans le code (hors commentaires)', !/hour12|\bAM\b|\bPM\b/.test(codeOnly), codeOnly.match(/hour12|\bAM\b|\bPM\b/)?.[0]);
check('aucun format horaire "Xh" résiduel pour le rappel (ancien style non-HH:mm)', !/getHours\(\)\)\.padStart\(2, '0'\)\}h\$/.test(screen));

console.log(`\n${failures === 0 ? 'TOUTES LES VÉRIFICATIONS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) process.exit(1);
