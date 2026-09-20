// Vérifications structurelles — CHANTIER PRÉ-BÊTA 1 (plus d'injection automatique des seeds, plus
// de demande automatique de la permission notifications, permission refusée définitivement →
// réglages système, MessageScreen avec contact disparu). Complète
// scripts/test-regression-boot-data.ts (logique pure) là où les fichiers concernés importent
// react-native/expo et ne peuvent pas être chargés sous ts-node. Script autonome (Node pur, comme
// check-taxonomy-integrity.js) — lecture seule, ne modifie rien.
//
// Usage : node scripts/check-onboarding-permissions.js

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

console.log('\n[1] Le store ne démarre plus avec les seeds comme état initial');
const store = read('src/data/store.tsx');
check('useState<Contact[]>([]) (plus seedContacts)', /useState<Contact\[\]>\(\[\]\)/.test(store));
check('useState<Pensee[]>([]) (plus seedPensees)', /useState<Pensee\[\]>\(\[\]\)/.test(store));
check('resolveBootData importé et utilisé (fallback cache, voir storeInit.ts)', /resolveBootData/.test(store));
check('seedContacts/seedPensees encore importés (fixtures pour resetLocalDemoData explicite)', /import \{ seedContacts, seedPensees \} from '\.\/seed'/.test(store));

console.log('\n[2] loadRemoteData (initializeForSession) a son propre try/catch, distinct de la lecture de session');
// CHANTIER "Data Safety P0-1" (2026-09-20) — ancre mise à jour : `ensureAnonSession()` a été
// remplacée par `getExistingSession()`/`startAnonymousSession()` (authRepo.ts), plus jamais de
// création de session automatique au boot (voir store.tsx, `initializeForSession`, chemin UNIQUE
// partagé par session existante / "Continuer" / "J'ai déjà un compte"). `loadRemoteData` garde son
// propre try/catch, INDÉPENDANT de la résolution de session (qui se fait AVANT, côté appelant —
// voir le bloc de boot : `getExistingSession()` n'est plus jamais couplée au même try que
// `loadRemoteData`, contrairement à l'ancien `ensureAnonSession()`).
const initFnStart = store.indexOf('async function initializeForSession(session: ExistingSession) {');
const initFnBlock = store.slice(initFnStart, initFnStart + 3600);
check('initializeForSession existe (chemin de boot UNIQUE, voir consigne §4)', initFnStart !== -1);
check('loadRemoteData entourée d’un try/catch dédié, propre à cette fonction', /try \{\s*remote = await loadRemoteData\(session\.userId, false\);\s*\} catch \(e\) \{/.test(initFnBlock));
check('le résultat distant est passé à resolveBootData (jamais utilisé seul comme état final)', /resolveBootData\(\{/.test(initFnBlock));
check(
  'getExistingSession() ne crée jamais de session automatiquement (jamais de fallback signInAnonymously/startAnonymousSession dans le boot normal)',
  !/getExistingSession\(\);\s*if \(!?session\)[\s\S]{0,80}startAnonymousSession/.test(store),
);
check(
  'ensureAnonSession n’est plus DÉFINIE dans supabaseRepo.ts (une mention en commentaire historique peut subsister dans store.tsx, sans risque)',
  !/export async function ensureAnonSession/.test(read('src/lib/supabaseRepo.ts')),
);
check('store.tsx appelle bien getExistingSession()/startAnonymousSession() (authRepo.ts)', /getExistingSession\(\)/.test(store) && /startAnonymousSession\(\)/.test(store));

console.log('\n[3] Compte Supabase neuf : plus de peuplement automatique via seedRemote()');
const supabaseRepo = read('src/lib/supabaseRepo.ts');
check('loadRemoteData n’appelle plus seedRemote automatiquement', !/isNewAccount\s*&&\s*\(contactRows[\s\S]{0,40}return seedRemote/.test(supabaseRepo));
check('seedRemote reste disponible (export), non câblée automatiquement', /export async function seedRemote/.test(supabaseRepo));

console.log('\n[4] rescheduleAllReminders ne demande plus jamais la permission (vérifie seulement)');
const notifications = read('src/lib/notifications.ts');
const rescheduleBlock = notifications.slice(
  notifications.indexOf('export async function rescheduleAllReminders'),
  notifications.indexOf('export async function scheduleTestNotificationIn60Seconds'),
);
check('utilise getNotificationPermissionStatus (vérification)', /getNotificationPermissionStatus\(\)/.test(rescheduleBlock));
check('n’appelle plus ensureNotificationPermissions (qui demande)', !/ensureNotificationPermissions\(\)/.test(rescheduleBlock));

console.log('\n[5] ensureNotificationPermissions (qui demande) reste réservée à une action utilisateur explicite (Réglages)');
const settingsScreen = read('src/screens/SettingsScreen.tsx');
check('SettingsScreen appelle ensureNotificationPermissions dans handleToggleNotifications (action explicite)', /handleToggleNotifications[\s\S]{0,300}ensureNotificationPermissions/.test(settingsScreen));
check('store.tsx n’appelle jamais ensureNotificationPermissions directement', !/ensureNotificationPermissions/.test(store));

console.log('\n[6] Permission refusée définitivement → bouton "Ouvrir les réglages du téléphone" dans Réglages');
check('Linking.openSettings référencé', /Linking\.openSettings\(\)/.test(settingsScreen));
check('conditionné par permStatus === \'denied\'', /permStatus === 'denied'/.test(settingsScreen));
check('échec de l’ouverture géré (try/catch)', /openSystemSettings[\s\S]{0,200}try \{[\s\S]{0,100}Linking\.openSettings/.test(settingsScreen));

console.log('\n[7] MessageScreen : plus de `return null` silencieux pour un contact disparu');
const messageScreen = read('src/screens/MessageScreen.tsx');
check('ne retourne plus null pour un contact manquant', !/if \(!contact\) return null;/.test(messageScreen));
check('affiche un état de récupération explicite', /Ce proche n’est plus disponible/.test(messageScreen));
check('propose un retour via navigation.goBack()', /navigation\.goBack\(\)/.test(messageScreen));

console.log('\n[8] Accueil : petit état vide "Ajouter un proche" si aucun proche');
const homeScreen = read('src/screens/HomeScreen.tsx');
check('condition sur contacts.length === 0 (disparaît dès le premier proche ajouté)', /contacts\.length === 0/.test(homeScreen));
check('CTA "Commencer" vers Fiche sans contactId', /navigation\.navigate\('Fiche', undefined\)/.test(homeScreen));

console.log(`\n${failures === 0 ? 'TOUTES LES VÉRIFICATIONS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) process.exit(1);
