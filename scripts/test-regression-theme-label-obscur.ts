/// <reference types="node" />
// Tests de non-régression — CHANTIER "Phase 7B — Rename thème Sombre → Obscur" (2026-09-23). Libellé
// utilisateur UNIQUEMENT (clin d'œil à Clair Obscur) — valeur interne, AsyncStorage, logique dark
// mode strictement inchangées. SettingsScreen.tsx/store.tsx (react-native) ne peuvent pas être
// chargés sous tsx (même constat que le reste de ce projet) — vérifié par lecture de source.
//
// Usage : npx tsx scripts/test-regression-theme-label-obscur.ts

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

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

console.log('\n[1] Libellé — "Obscur" présent, "Sombre" disparu, valeur interne key:\'dark\' INCHANGÉE');
{
  const src = readSrc('src', 'screens', 'SettingsScreen.tsx');
  check('THEME_OPTIONS contient { key: \'dark\', label: \'Obscur\', ... } — valeur interne strictement inchangée', /\{ key: 'dark', label: 'Obscur', icon: 'moon-outline' \}/.test(src));
  check('le libellé "Sombre" (chaîne littérale label: \'Sombre\') n’apparaît plus dans ce fichier', !/label: 'Sombre'/.test(src));
  check('les 2 autres options (Système/Clair) restent inchangées', /\{ key: 'system', label: 'Système', icon: 'phone-portrait-outline' \}/.test(src) && /\{ key: 'light', label: 'Clair', icon: 'sunny-outline' \}/.test(src));
  check('aucune autre occurrence du libellé littéral \'Sombre\' dans tout le projet (src/scripts/docs) — audit exhaustif (les commentaires mentionnant l’historique du renommage sont ignorés)', (() => {
    const roots = ['src', 'scripts', 'docs'];
    for (const root of roots) {
      const dir = path.join(__dirname, '..', root);
      if (!fs.existsSync(dir)) continue;
      const stack = [dir];
      while (stack.length) {
        const current = stack.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (/\.(ts|tsx|md)$/.test(entry.name) && full !== __filename) {
            const content = fs.readFileSync(full, 'utf8');
            if (/label: 'Sombre'/.test(content)) return false;
          }
        }
      }
    }
    return true;
  })());
}

console.log('\n[2] Valeur interne / type ThemePref — strictement inchangée (aucun enum/type/clé AsyncStorage touché)');
{
  const storeSrc = readSrc('src', 'data', 'store.tsx');
  check('type ThemePref = \'system\' | \'light\' | \'dark\' — inchangé', /export type ThemePref = 'system' \| 'light' \| 'dark';/.test(storeSrc));
  check('clé AsyncStorage "pensif.themePref" — inchangée', /themePref: 'pensif\.themePref'/.test(storeSrc));
  check('la valeur persistée pour Obscur reste la chaîne "dark" (jamais "Obscur"/"obscur")', /setThemePref: \(pref: ThemePref\) => \{\s*setThemePrefState\(pref\);\s*AsyncStorage\.setItem\(KEYS\.themePref, pref\)/.test(storeSrc));
}

console.log('\n[3] Sélection Obscur → applique toujours le thème sombre existant (logique dark mode/theme/index.ts non touchée)');
{
  const themeIndexSrc = readSrc('src', 'theme', 'index.ts');
  // Aucune référence à "Sombre"/"Obscur" ne doit exister côté moteur de thème — il ne connaît que
  // 'dark'/'light'/'system' (ThemePref), jamais un libellé UI (séparation stricte affichage/logique).
  check('theme/index.ts ne référence ni "Sombre" ni "Obscur" (aucun libellé UI dans la logique de thème)', !themeIndexSrc.includes('Sombre') && !themeIndexSrc.includes('Obscur'));
}

console.log('\n[4] Reload — préférence toujours persistée (boot store.tsx, lecture de \'pensif.themePref\', non modifiée par cette passe)');
{
  const storeSrc = readSrc('src', 'data', 'store.tsx');
  check(
    'lecture au boot : if (t === \'light\' || t === \'dark\' || t === \'system\') setThemePrefState(t) — inchangée',
    /if \(t === 'light' \|\| t === 'dark' \|\| t === 'system'\) setThemePrefState\(t\);/.test(storeSrc),
  );
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
