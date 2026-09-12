// Vérifications structurelles — CHANTIER PROCHES + FICHE V1. Complète
// scripts/test-regression-contacts-fiche.ts (logique pure) là où les composants React Native
// (ContactsScreen/FicheScreen/PenseesScreen) ne peuvent pas être chargés sous ts-node. Script
// autonome (Node pur, comme check-taxonomy-integrity.js/check-pensees-navigation.js) — lecture
// seule, ne modifie rien.
//
// Usage : node scripts/check-contacts-fiche.js

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

console.log('\n[1] Chaînes UI renommées Contacts → Proches');
const forbidden = ['Mes contacts', 'Nouveau contact', 'Supprimer ce contact', 'Contacts suivis'];
const srcFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full);
  }
})(path.join(root, 'src'));

for (const text of forbidden) {
  const hit = srcFiles.find((f) => read(path.relative(root, f)).includes(text));
  check(`"${text}" n'apparaît plus nulle part`, !hit, hit ? path.relative(root, hit) : '');
}

const contactsScreen = read('src/screens/ContactsScreen.tsx');
check('"Mes proches" présent', contactsScreen.includes('Mes proches'));
check('"proche suivi"/"proches suivis" présent', /proche suivi/.test(contactsScreen) && /proches suivis/.test(contactsScreen));
check('accessibilityLabel "Ajouter un proche" sur le bouton +', /accessibilityLabel="Ajouter un proche"/.test(contactsScreen));
check('état vide "Ajoute les personnes qui comptent"', contactsScreen.includes('Ajoute les personnes qui comptent'));
check('tri par compareContacts (pas le seul favori)', /compareContacts/.test(contactsScreen));
check('birthdayCountdownLabel réutilisé (pas de logique d’occurrence recodée)', /birthdayCountdownLabel/.test(contactsScreen));

const settingsScreen = read('src/screens/SettingsScreen.tsx');
check('"Proches suivis" présent dans Réglages', settingsScreen.includes('Proches suivis'));

const ficheScreen = read('src/screens/FicheScreen.tsx');
check('"Nouveau proche" présent (titre de création)', ficheScreen.includes('Nouveau proche'));
check('"Supprimer ce proche" présent', ficheScreen.includes('Supprimer ce proche'));
check('titre "Fiche contact" totalement absent de FicheScreen', !ficheScreen.includes('Fiche contact'));

console.log('\n[2] Titre de la Fiche : source unique (RootNavigator ne fixe plus de titre statique)');
const rootNav = read('src/navigation/RootNavigator.tsx');
check('RootNavigator ne fixe plus "Fiche contact"', !rootNav.includes('Fiche contact'));
check('FicheScreen calcule le titre depuis existing.prenom/nom', /title:\s*existing\s*\?\s*`\$\{existing\.prenom\}/.test(ficheScreen));

console.log('\n[3] Synthèse compacte pour un proche existant, absente pour un nouveau');
check('synthèse conditionnée par `existing`', /\{existing \? \(/.test(ficheScreen) || /existing\s*\?\s*\(/.test(ficheScreen));
check('synthèse affiche relation + birthdayCountdownLabel', /summaryMeta/.test(ficheScreen) && /birthdayCountdownLabel\(date, today\)/.test(ficheScreen));

console.log('\n[4] Section Pensées liées sur la Fiche');
check('section "PENSÉES LIÉES" présente', /PENSÉES LIÉES/.test(ficheScreen));
check('calcule via pensees.filter + buildPenseeCards/groupPenseeCards (aucune logique recréée)', /pensees\.filter\(\(p\) => p\.contactId === existing\.id\)/.test(ficheScreen) && /buildPenseeCards/.test(ficheScreen) && /groupPenseeCards/.test(ficheScreen));
check('CTA "Voir les pensées" présent', /Voir les pensées/.test(ficheScreen));
check('navigue vers Tabs→Pensées avec le bon contactId', /screen:\s*'Pensées',\s*params:\s*\{\s*contactId:\s*existing\.id\s*\}/.test(ficheScreen));

console.log('\n[5] Quiz/Cadeaux inchangés');
check('lien Cadeaux toujours conditionné par isQuizComplete', /isQuizComplete\(existing\.quiz\)\s*&&/.test(ficheScreen));
check('navigate(\'Cadeaux\', { contactId: existing.id }) toujours présent', /navigation\.navigate\('Cadeaux', \{ contactId: existing\.id \}\)/.test(ficheScreen));

console.log('\n[6] PenseesScreen : filtre contactId');
const penseesScreen = read('src/screens/PenseesScreen.tsx');
check('lit route.params?.contactId', /route\.params\?\.\s*contactId/.test(penseesScreen));
check('filtre les pensées quand un contactId est fourni', /pensees\.filter\(\(p\) => p\.contactId === filterContactId\)/.test(penseesScreen));
check('en-tête contextuel "Pensées de {prénom}"', /Pensées de \$\{filterContact/.test(penseesScreen));
check('action "Toutes les pensées" présente', /Toutes les pensées/.test(penseesScreen));
check('retire le filtre via setParams (pas navigate) — reste sur l’écran', /setParams\(\{ contactId: undefined \}\)/.test(penseesScreen));
check('sans contactId, comportement normal conservé (Aujourd’hui/À venir/Passées toujours présents)', /AUJOURD'HUI/.test(penseesScreen) && /À VENIR/.test(penseesScreen) && /PASSÉES/.test(penseesScreen));

console.log('\n[7] Réinitialisation du filtre au tap direct sur l’onglet (TabBar)');
const tabBar = read('src/navigation/TabBar.tsx');
check('TabBar utilise paramsForTabPress lors de la navigation', /paramsForTabPress/.test(tabBar));
check('libellé d’onglet "Proches" pour la route Contacts', /Contacts:\s*'Proches'/.test(tabBar));

console.log(`\n${failures === 0 ? 'TOUTES LES VÉRIFICATIONS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) process.exit(1);
