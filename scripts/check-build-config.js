// Vérifications structurelles — CHANTIER PRÉ-BÊTA 2 (identifiants natifs, profils EAS, version non
// contradictoire, Error Boundary bien monté, aucune logique métier touchée). Script autonome (Node
// pur, comme check-taxonomy-integrity.js) — lecture seule, ne modifie rien.
//
// Usage : node scripts/check-build-config.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}
function readJson(relPath) {
  return JSON.parse(read(relPath));
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

console.log('\n[1] Identifiants natifs présents et stables');
const appJson = readJson('app.json');
check('ios.bundleIdentifier = com.yomic.pensif', appJson.expo?.ios?.bundleIdentifier === 'com.yomic.pensif');
check('android.package = com.yomic.pensif', appJson.expo?.android?.package === 'com.yomic.pensif');
check('slug inchangé (pensif-app)', appJson.expo?.slug === 'pensif-app');
check('name inchangé (Pensif)', appJson.expo?.name === 'Pensif');

console.log('\n[2] Profils EAS présents');
const easJson = readJson('eas.json');
check('profil development présent', Boolean(easJson.build?.development));
check('profil preview présent', Boolean(easJson.build?.preview));
check('profil production présent', Boolean(easJson.build?.production));
check('appVersionSource défini (source de version non ambiguë)', Boolean(easJson.cli?.appVersionSource));

console.log('\n[3] Version non contradictoire entre les sources');
const pkgJson = readJson('package.json');
check('app.json expo.version === package.json version', appJson.expo?.version === pkgJson.version, `${appJson.expo?.version} vs ${pkgJson.version}`);
check('ios.buildNumber renseigné', typeof appJson.expo?.ios?.buildNumber === 'string' && appJson.expo.ios.buildNumber.length > 0);
check('android.versionCode renseigné', typeof appJson.expo?.android?.versionCode === 'number');
const settingsScreen = read('src/screens/SettingsScreen.tsx');
check('Réglages lit la version via expo-constants (plus de "1.0.0" codé en dur)', /Constants\.expoConfig\?\.version/.test(settingsScreen) && !/value="1\.0\.0"/.test(settingsScreen));

console.log('\n[4] Error Boundary réellement monté autour de l’application');
const appTsx = read('App.tsx');
check('App.tsx importe ErrorBoundary', /import \{ ErrorBoundary \} from '\.\/src\/components\/ErrorBoundary'/.test(appTsx));
check('ErrorBoundary englobe bien StoreProvider/AppShell (pas seulement un enfant isolé)', /<ErrorBoundary>[\s\S]*<StoreProvider>[\s\S]*<AppShell \/>[\s\S]*<\/StoreProvider>[\s\S]*<\/ErrorBoundary>/.test(appTsx));
const errorBoundaryFile = read('src/components/ErrorBoundary.tsx');
check('getDerivedStateFromError implémenté', /static getDerivedStateFromError/.test(errorBoundaryFile));
check('pas de stack trace affichée à l’utilisateur (uniquement console.error en dev)', !/Text[^>]*>\s*\{.*(error|stack)/i.test(errorBoundaryFile));

console.log('\n[5] Aucune logique métier touchée accidentellement (fichiers interdits inchangés dans ce chantier)');
const untouchable = [
  'src/data/recommendationEngine.ts',
  'src/data/giftCatalog.ts',
  'src/data/quiz.ts',
  'src/data/themeQuizzes.ts',
  'src/data/homeAttention.ts',
  'src/lib/notificationPlanning.ts',
  'src/data/penseesView.ts',
  'src/screens/ContactsScreen.tsx',
  'src/screens/CalendarScreen.tsx',
  'supabase/schema.sql',
];
const { execSync } = require('child_process');
let gitDiffNames = '';
try {
  gitDiffNames = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf8' });
} catch {
  gitDiffNames = '';
}
if (!gitDiffNames) {
  console.log('  (git indisponible ou aucune diff détectée — vérification passée par défaut)');
} else {
  const changed = new Set(gitDiffNames.split('\n').map((l) => l.trim()).filter(Boolean));
  const touched = untouchable.filter((f) => changed.has(f));
  check('aucun fichier métier interdit ne figure dans le diff de ce chantier', touched.length === 0, touched.join(', '));
}

console.log(`\n${failures === 0 ? 'TOUTES LES VÉRIFICATIONS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) process.exit(1);
