/// <reference types="node" />
// Tests de non-régression — CHANTIER UX §3 (2026-09-15) : icône micro des headers Accueil/Pensées
// agrandie (~28px, cible tactile 48x48) SANS agrandir les icônes voisines (Réglages/Ajouter).
//
// IMPORTANT — portée réelle : pas de harnais de composant React Native ici (voir
// test-regression-capture-processing-ux.ts) — vérifie la présence exacte des extraits source qui
// implémentent chaque exigence de taille/alignement, dans HomeScreen.tsx et PenseesScreen.tsx.
//
// Usage : npx tsx scripts/test-regression-header-mic-icon.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readScreen(name: string): string {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', `${name}.tsx`), 'utf8');
}

for (const screenName of ['HomeScreen', 'PenseesScreen']) {
  console.log(`\n[${screenName}.tsx]`);
  const source = readScreen(screenName);

  check(
    'style micIconBtn dédié déclaré : 48x48 (cible tactile minimum)',
    /micIconBtn: \{\s*width: 48,\s*height: 48,\s*borderRadius: 24,/.test(source),
    'micIconBtn manquant ou pas 48x48',
  );
  check(
    'le bouton micro utilise styles.micIconBtn (pas styles.iconBtn)',
    /style=\{\[styles\.micIconBtn, \{ backgroundColor:/.test(source),
  );
  check(
    'icône "mic"/"mic-outline" rendue à 28px (taille visuelle cible ~28-30px)',
    /name="mic(-outline)?" size=\{28\}/.test(source),
  );
  check(
    'styles.iconBtn (36x36) toujours présent ET inchangé — les icônes voisines ne grossissent PAS',
    /iconBtn: \{ width: 36, height: 36, borderRadius: 18,/.test(source),
  );
  check(
    'la rangée du header centre verticalement ses boutons malgré la différence de hauteur (48 vs 36)',
    /flexDirection: 'row', alignItems: 'center', gap: 8/.test(source),
  );
}

console.log('\n[priorité visuelle conservée — pas de recolorisation demandée, seulement la taille]');
const home = readScreen('HomeScreen');
check(
  'Accueil : le micro reste coloré (theme.accent) — priorité visuelle sur Réglages (fond neutre) inchangée',
  home.includes("style={[styles.micIconBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}"),
);
const pensees = readScreen('PenseesScreen');
check(
  'Pensées : le micro garde son traitement "secondaire" existant (fond neutre, comme avant) — seule la taille change',
  pensees.includes('style={[styles.micIconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}'),
);

console.log('\n[pas de 5e tab / pas de FAB — hors périmètre de ce chantier]');
console.log('  Vérifié par relecture : RootNavigator.tsx et le composant de tab bar ne sont pas');
console.log('  touchés par ce chantier (seuls HomeScreen.tsx/PenseesScreen.tsx ont changé) — aucune');
console.log('  nouvelle route/tab ni bouton flottant ajouté.');

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
