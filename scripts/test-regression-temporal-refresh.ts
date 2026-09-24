/// <reference types="node" />
// CHANTIER "Horloge UI fraîche" (2026-09-23) — store.tsx (react-native) ne peut pas être chargé sous
// tsx (même constat que le reste de ce projet, voir AGENTS établis) : vérification par source-grep.
// Couvre §7 de la consigne : `today` n'est plus créé dans le useMemo, refresh AppState→active,
// ticker central minute-aligned existant/nettoyé, et non-régression (un seul listener AppState étendu,
// pas de useFocusEffect ajouté, aucune règle de récurrence touchée).
//
// Usage : npx tsx scripts/test-regression-temporal-refresh.ts

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

const storeSrc = readSrc('src', 'data', 'store.tsx');

console.log('\n[1] today est un state React explicite, plus recréé dans le useMemo<Store>');
{
  check('useState<Date> déclaré pour today', /const \[today, setToday\] = useState<Date>\(\(\) => new Date\(\)\);/.test(storeSrc));
  check('le useMemo<Store> ne recrée plus "const today = new Date()" en interne', !/useMemo<Store>\(\s*\(\) => \{\s*const today = new Date\(\);/.test(storeSrc));
  check('today figure dans les dépendances du useMemo<Store> (sinon la valeur exposée resterait stale malgré le state)', /\[ready, today, contacts, pensees,/.test(storeSrc));
}

console.log('\n[2] Refresh immédiat au retour AppState → active (listener existant étendu, pas un nouveau)');
{
  const drainListenerMatch = storeSrc.match(/\/\/ CHANTIER SYNC OFFLINE→SUPABASE[\s\S]*?return \(\) => \{\s*sub\.remove\(\);\s*unsubscribeNetInfo\(\);\s*\};\s*\}, \[ready\]\);/);
  check('le bloc "CHANTIER SYNC OFFLINE→SUPABASE" (drain outbox) est bien retrouvé', !!drainListenerMatch);
  if (drainListenerMatch) {
    const block = drainListenerMatch[0];
    check('setToday(new Date()) appelé dans CE MÊME listener AppState (état actif)', /if \(state === 'active'\) \{\s*[\s\S]*?setToday\(new Date\(\)\);/.test(block));
    check('restoreSessionThenDrain() toujours appelée dans le même bloc (non supprimée)', /void restoreSessionThenDrain\(\);/.test(block));
  }
  const appStateListenerCount = (storeSrc.match(/AppState\.addEventListener\('change',/g) ?? []).length;
  check('exactement 3 listeners AppState au total (notifications resync + drain/today étendu + ticker minute) — aucun 4e listener ajouté à côté', appStateListenerCount === 3, `trouvé ${appStateListenerCount}`);
}

console.log('\n[3] Ticker central minute-aligned (un seul, dans le Store — pas un par écran)');
{
  check('un seul useEffect dédié au ticker (commentaire CHANTIER "Horloge UI fraîche" + scheduleNextMinuteTick)', /function scheduleNextMinuteTick\(\)/.test(storeSrc));
  check('aligné sur la frontière de minute (60 - seconds), pas un interval à instant arbitraire', /\(60 - now\.getSeconds\(\)\) \* 1000 - now\.getMilliseconds\(\)/.test(storeSrc));
  check('marge appliquée après la frontière (évite un réveil juste avant la minute)', /getMilliseconds\(\) \+ 50/.test(storeSrc));
  check('setToday(new Date()) appelé à chaque tick', /timeoutId = setTimeout\(\(\) => \{\s*setToday\(new Date\(\)\);\s*scheduleNextMinuteTick\(\);/.test(storeSrc));
  check('aucun setInterval utilisé pour ce ticker (uniquement setTimeout auto-replanifié)', !/setInterval\(/.test(storeSrc));
  check('le ticker est arrêté en background/inactive (clearTick() sur AppState non actif)', /if \(appActive\) \{\s*setToday\(new Date\(\)\);\s*scheduleNextMinuteTick\(\);\s*\} else \{\s*clearTick\(\);\s*\}/.test(storeSrc));
  check('nettoyage au unmount (clearTick + sub.remove dans le return du useEffect)', /return \(\) => \{\s*clearTick\(\);\s*sub\.remove\(\);\s*\};/.test(storeSrc));
}

console.log('\n[4] Non-régression — aucune règle de récurrence touchée, aucun useFocusEffect ajouté dans le Store');
{
  check('reminderRecurrence.ts non référencé/modifié dans ce diff (le Store ne réimplémente aucun calcul de récurrence)', !/computeNextReminderOccurrences|nextPenseeReminderOccurrence|reminderRecurrenceMatchesDate/.test(storeSrc));
  check('aucun useFocusEffect(...) réellement APPELÉ dans store.tsx (une mention en commentaire expliquant ce choix reste acceptée)', !/\buseFocusEffect\(/.test(storeSrc));
}

console.log('\n[5] Home/Pensées consomment toujours la même unique source (non modifiés par ce chantier)');
{
  const homeSrc = readSrc('src', 'screens', 'HomeScreen.tsx');
  const penseesSrc = readSrc('src', 'screens', 'PenseesScreen.tsx');
  check('HomeScreen.tsx lit today via useStore() (source unique, inchangé)', /const \{ contacts, pensees, userName, today \} = useStore\(\);/.test(homeSrc));
  check('HomeScreen.tsx ne contient aucun useFocusEffect ajouté pour ce chantier', !homeSrc.includes('useFocusEffect'));
  check('PenseesScreen.tsx lit today via useStore() (source unique, inchangé)', /const \{ pensees, contacts, today, deletePensee \} = useStore\(\);/.test(penseesSrc));
  check('PenseesScreen.tsx ne contient aucun useFocusEffect ajouté pour ce chantier', !penseesSrc.includes('useFocusEffect'));
}

console.log('\n[6] Non-régression — Calendar/notificationPlanning/modèle de récurrence non touchés par ce chantier');
{
  const roots = ['reminderRecurrence.ts', 'calendar.ts', 'homeAttention.ts', 'penseesView.ts'].map((f) => path.join(__dirname, '..', 'src', 'data', f));
  for (const file of roots) {
    check(`${path.basename(file)} ne référence aucun mécanisme d'horloge/ticker de ce chantier (aucune fuite d'implémentation)`, !fs.readFileSync(file, 'utf8').includes('scheduleNextMinuteTick'));
  }
  const notifPlanningSrc = readSrc('src', 'lib', 'notificationPlanning.ts');
  check('notificationPlanning.ts ne référence aucun mécanisme d\'horloge/ticker de ce chantier', !notifPlanningSrc.includes('scheduleNextMinuteTick'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
