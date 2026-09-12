// Vérifications structurelles — CHANTIER ONGLET PENSÉES V1 : garantit qu'aucun ancien chemin de
// navigation vers l'onglet Cadeaux ne subsiste, et que les nouveaux points de câblage attendus sont
// bien en place. Complète scripts/test-regression-pensees.ts (logique pure) là où le composant
// React Native lui-même ne peut pas être chargé sous ts-node (imports react-native/expo). Script
// autonome (Node pur, comme check-taxonomy-integrity.js) — lecture seule, ne modifie rien.
//
// Usage : node scripts/check-pensees-navigation.js

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

console.log('\n[1] Aucune ancienne navigation Tabs→Cadeaux ne subsiste');
const srcFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full);
  }
})(path.join(root, 'src'));

const staleTabsCadeauxPattern = /screen:\s*['"]Cadeaux['"]/;
const staleFiles = srcFiles.filter((f) => staleTabsCadeauxPattern.test(read(path.relative(root, f))));
check('aucun fichier ne contient plus `screen: \'Cadeaux\'`', staleFiles.length === 0, staleFiles.join(', '));

console.log('\n[2] Cadeaux est bien un écran du Stack, plus un onglet du Tab.Navigator');
const rootNav = read('src/navigation/RootNavigator.tsx');
check('Stack.Screen name="Cadeaux" présent', /<Stack\.Screen\s+name="Cadeaux"/.test(rootNav));
check('Tab.Screen name="Cadeaux" absent', !/<Tab\.Screen\s+name="Cadeaux"/.test(rootNav));
check('Tab.Screen name="Pensées" présent, à la place', /<Tab\.Screen\s+name="Pensées"/.test(rootNav));

console.log('\n[3] navigation/types.ts : Cadeaux déplacé vers RootStackParamList, contactId obligatoire');
const navTypes = read('src/navigation/types.ts');
const tabParamListBlock = navTypes.slice(navTypes.indexOf('TabParamList = {'), navTypes.indexOf('RootStackParamList'));
const rootStackBlock = navTypes.slice(navTypes.indexOf('RootStackParamList = {'));
check('Cadeaux absent de TabParamList', !/\bCadeaux\s*:/.test(tabParamListBlock));
check('Pensées présent dans TabParamList', /\bPensées\s*:/.test(tabParamListBlock));
check('Cadeaux présent dans RootStackParamList avec contactId obligatoire (pas de `?`)', /Cadeaux:\s*\{\s*contactId:\s*string\s*\}/.test(rootStackBlock));

console.log('\n[4] Swipe Calendrier → Pensées (plus Cadeaux)');
const calendarScreen = read('src/screens/CalendarScreen.tsx');
const goToPreviousTabBlock = calendarScreen.slice(
  calendarScreen.indexOf('function goToPreviousTab'),
  calendarScreen.indexOf('function goToPreviousTab') + 200,
);
check('navigate(\'Pensées\') dans goToPreviousTab', /navigate\(\s*['"]Pensées['"]/.test(goToPreviousTabBlock), goToPreviousTabBlock);
check('plus de navigate(\'Cadeaux\') dans goToPreviousTab', !/navigate\(\s*['"]Cadeaux['"]/.test(goToPreviousTabBlock));

console.log('\n[5] GiftsScreen n’a plus de fallback implicite sans contactId');
const giftsScreen = read('src/screens/GiftsScreen.tsx');
check(
  'plus de sélection "prochain contact avec quiz fait" (isQuizComplete + tri par daysUntilNext dans le calcul du contact)',
  !/withIdeas/.test(giftsScreen),
);
check('route.params.contactId lu directement (obligatoire), pas de `route.params?.contactId`', !/route\.params\?\.\s*contactId/.test(giftsScreen));

console.log('\n[6] Fiche + quiz terminé → Cadeaux avec le bon contactId');
const ficheScreen = read('src/screens/FicheScreen.tsx');
check(
  'navigation.navigate(\'Cadeaux\', { contactId: existing.id }) présent',
  /navigation\.navigate\(\s*['"]Cadeaux['"]\s*,\s*\{\s*contactId:\s*existing\.id\s*\}\s*\)/.test(ficheScreen),
);
check('conditionné par isQuizComplete', /isQuizComplete\(existing\.quiz\)\s*&&/.test(ficheScreen));

console.log('\n[7] PenseesScreen existe et est bien celui utilisé pour l’onglet');
check('src/screens/PenseesScreen.tsx existe', fs.existsSync(path.join(root, 'src/screens/PenseesScreen.tsx')));
check('RootNavigator importe et utilise PenseesScreen sur l’onglet Pensées', /<Tab\.Screen\s+name="Pensées"\s+component=\{PenseesScreen\}/.test(rootNav));

console.log(`\n${failures === 0 ? 'TOUTES LES VÉRIFICATIONS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) process.exit(1);
