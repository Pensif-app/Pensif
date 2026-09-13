// Tests de non-régression — CHANTIER CAPTURE INTELLIGENTE : push-to-talk (src/data/pushToTalk.ts).
//
// IMPORTANT — portée réelle de ce fichier : seul le seuil minimal de maintien (isPressTooShort) est
// une logique PURE, testable sans React/expo-audio. Le reste du comportement demandé (pressIn
// démarre l'enregistrement, pressOut valide passe en processing, retour arrière nettoie le
// recorder, allowsRecording actif seulement pendant l'écoute) vit dans CaptureScreen.tsx et
// orchestre directement des modules natifs (expo-audio) — ce projet n'a pas de harnais de test de
// composant React Native (pas de jest/RTL installé), donc ces scénarios sont vérifiés par relecture
// du code plutôt que par exécution automatisée. Le détail de cette vérification (scénarios 1,2,3,5,6)
// est documenté ci-dessous, avec la ligne exacte de CaptureScreen.tsx qui l'implémente.
//
// Usage : npx tsx scripts/test-regression-capture-push-to-talk.ts

import { MIN_HOLD_MS, isPressTooShort } from '../src/data/pushToTalk';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log(`\n[seuil] MIN_HOLD_MS = ${MIN_HOLD_MS}ms (fourchette demandée : 300-500ms)`);
check('seuil dans la fourchette demandée', MIN_HOLD_MS >= 300 && MIN_HOLD_MS <= 500);

console.log('\n[4] pressOut trop rapide → annulation (tap sous le seuil)');
check('0ms → trop court', isPressTooShort(0));
check('1ms → trop court', isPressTooShort(1));
check(`${MIN_HOLD_MS - 1}ms → trop court`, isPressTooShort(MIN_HOLD_MS - 1));

console.log('\n[3] pressOut après durée valide → pas d’annulation (déclenche processing)');
check(`${MIN_HOLD_MS}ms (exactement le seuil) → pas annulé`, !isPressTooShort(MIN_HOLD_MS));
check(`${MIN_HOLD_MS + 1}ms → pas annulé`, !isPressTooShort(MIN_HOLD_MS + 1));
check('3000ms (dictée normale) → pas annulé', !isPressTooShort(3000));

console.log('\n[revue de code — scénarios non automatisables sans harnais RN/expo-audio]');
console.log('  [1] Ouverture Capture → aucun enregistrement');
console.log('      CaptureScreen.tsx : phase initiale = useState<Phase>(\'idle\') ; aucun useEffect');
console.log('      n’appelle plus recorder.record() au montage (l’ancien startListening() automatique');
console.log('      a été retiré) — record() n’est atteint que depuis handlePressIn().');
console.log('  [2] pressIn → recording démarre');
console.log('      handlePressIn() : permission → setAudioModeAsync({allowsRecording:true}) →');
console.log('      prepareToRecordAsync() → recorder.record() → isRecordingRef.current = true →');
console.log('      setPhase(\'listening\').');
console.log('  [5] Retour arrière pendant recording → recorder nettoyé');
console.log('      useEffect de nettoyage (cleanup au unmount) : if (isRecordingRef.current)');
console.log('      recorder.stop() puis setAudioModeAsync({allowsRecording:false}) dans tous les cas.');
console.log('  [6] allowsRecording activé SEULEMENT pendant l’enregistrement');
console.log('      setAudioModeAsync({allowsRecording:true}) n’est appelé que dans handlePressIn()');
console.log('      (juste avant prepareToRecordAsync) ; remis à false dans handlePressOut() (dans tous');
console.log('      les cas, y compris tap trop court) ET dans le cleanup au unmount — jamais laissé à');
console.log('      true en dehors d’un enregistrement actif.');

console.log(`\n${failures === 0 ? 'TOUS LES TESTS AUTOMATISÉS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
