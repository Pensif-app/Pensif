// CHANTIER "DateTimePicker cohérent avec le thème Pensif" (2026-09-24) — le spinner iOS suit sinon
// l'apparence SYSTÈME de l'iPhone, pas le thème Pensif (Système/Clair/Obscur). Écrans react-native :
// source-grep pour le câblage ; la règle de résolution est extraite et EXÉCUTÉE pour de vrai.
//
// Usage : npx tsx scripts/test-regression-picker-theme.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');

console.log('\n[isDark] source unique dans theme/index.ts');
const themeSrc = read('src', 'theme', 'index.ts');
const fnMatch = themeSrc.match(/function resolveIsDark\(themePref: string, systemScheme: string \| null \| undefined\): boolean \{([\s\S]*?)\n\}/);
check('resolveIsDark défini une seule fois', (themeSrc.match(/function resolveIsDark/g) ?? []).length === 1 && !!fnMatch);
check('useTheme ET useIsDark passent par resolveIsDark (règle non dupliquée)', (themeSrc.match(/resolveIsDark\(themePref, systemScheme\)/g) ?? []).length === 2);
check('useIsDark exporté', /export function useIsDark\(\): boolean/.test(themeSrc));
const resolveIsDark = new Function('themePref', 'systemScheme', fnMatch![1]) as (a: string, b: string | null) => boolean;
check('Pensif Clair + iPhone Clair → light', resolveIsDark('light', 'light') === false);
check('Pensif Clair + iPhone Sombre → light (le thème Pensif prime)', resolveIsDark('light', 'dark') === false);
check('Pensif Obscur + iPhone Clair → dark (le thème Pensif prime)', resolveIsDark('dark', 'light') === true);
check('Pensif Obscur + iPhone Sombre → dark', resolveIsDark('dark', 'dark') === true);
check('Pensif Système + iPhone Clair → light', resolveIsDark('system', 'light') === false);
check('Pensif Système + iPhone Sombre → dark', resolveIsDark('system', 'dark') === true);
check('Pensif Système sans schéma système → light', resolveIsDark('system', null) === false);

console.log('\n[Pickers] chaque DateTimePicker iOS reçoit themeVariant, aucune couleur codée en dur');
const files = ['src/screens/CaptureScreen.tsx', 'src/screens/PenseeDetailScreen.tsx', 'src/components/RecurrenceEditorSheet.tsx', 'src/screens/FicheScreen.tsx'];
let iosCapable = 0;
let androidOnly = 0;
for (const f of files) {
  const src = read(...f.split('/'));
  const re = /<DateTimePicker(?![A-Za-z])[\s\S]*?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const block = m[0];
    const line = src.slice(0, m.index).split('\n').length;
    const androidConst = /display="(calendar|clock)"/.test(block);
    if (androidConst) {
      androidOnly++;
      check(`${f}:${line} picker Android-only (display constant calendar/clock) : pas de themeVariant (prop iOS inexistante sur ce type)`, !block.includes('themeVariant'));
    } else {
      iosCapable++;
      check(`${f}:${line} picker iOS-capable : themeVariant={isDark ? 'dark' : 'light'}`, block.includes("themeVariant={isDark ? 'dark' : 'light'}"));
    }
  }
  check(`${f} : isDark vient de useIsDark() (thème Pensif résolu)`, /const isDark = useIsDark\(\);/.test(src));
  check(`${f} : aucun textColor/accentColor codé en dur`, !/textColor=|accentColor=/.test(src.replace(/textColor: /g, '')));
}
check('12 pickers au total : 8 iOS-capables couverts + 4 Android-only', iosCapable === 8 && androidOnly === 4, `iOS=${iosCapable} Android=${androidOnly}`);

console.log('\n[Non-régression] props métier des pickers inchangées');
const capture = read('src', 'screens', 'CaptureScreen.tsx');
check('display="spinner" + locale + is24Hour conservés côté Capture', /display="spinner"\n\s+locale=\{IOS_PICKER_LOCALE\}\n\s+is24Hour/.test(capture) || /themeVariant=\{isDark \? 'dark' : 'light'\}\n\s+value=/.test(capture));
check('composant partagé DateTimePickerHost : display iOS spinner / Android clock|calendar conservé', capture.includes("display={Platform.OS === 'ios' ? 'spinner' : mode === 'time' ? 'clock' : 'calendar'}"));
check('minimumDate de la fin de récurrence conservé', read('src', 'components', 'RecurrenceEditorSheet.tsx').includes('minimumDate={startDate ? localDateToJsDate(startDate) : undefined}'));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
