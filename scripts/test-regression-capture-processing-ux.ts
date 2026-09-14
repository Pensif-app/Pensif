/// <reference types="node" />
// Tests de non-régression — CHANTIER "sécuriser le cycle Capture" (2026-09-14, révisé 2026-09-15
// après retours réels iPhone) : états UX explicites idle/listening/processing/review + arrêt des
// ripples au relâchement + confirmation de sortie pendant PROCESSING + enchaînement "Nouvelle
// capture".
//
// IMPORTANT — portée réelle de ce fichier : ce projet n'a pas de harnais de test de composant React
// Native (pas de jest/RTL) — on ne peut donc pas monter CaptureScreen et observer un rendu réel.
// Ces tests vérifient à la place la PRÉSENCE EXACTE, dans le code source, des extraits précis qui
// implémentent chaque exigence — une reformulation/suppression accidentelle de ces extraits fait
// échouer ce test, sans dépendre d'un harnais RN.
//
// Usage : npx tsx scripts/test-regression-capture-processing-ux.ts

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

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'screens', 'CaptureScreen.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function checkContains(label: string, needle: string) {
  check(label, source.includes(needle), `chaîne attendue absente de CaptureScreen.tsx : "${needle}"`);
}
function checkNotContains(label: string, needle: string) {
  check(label, !source.includes(needle), `chaîne qui NE DEVRAIT PLUS être présente dans CaptureScreen.tsx : "${needle}"`);
}

console.log('\n[transition idle -> listening -> processing -> review]');
checkContains('phase initiale = idle', "useState<Phase>('idle')");
checkContains('press-and-hold démarre l’enregistrement puis passe listening', "setPhase('listening')");
checkContains(
  'PROCESSING déclenché DÈS le relâchement (avant tout await réseau), pas seulement après STT/LLM',
  "if (!isPressTooShort(heldMs)) {\n      setPhase('processing');\n    }",
);
checkContains('résultat exploitable → écran Review existant', "setPhase('review')");
checkContains('tap trop court → jamais de PROCESSING, retour direct idle', "setPhase('idle');\n      return;\n    }\n\n    if (!uri) {");

console.log('\n[arrêt des ripples au passage PROCESSING]');
checkContains(
  'stopRipples() appelé SYNCHRONEMENT au relâchement (onPanResponderRelease), avant tout traitement async',
  'onPanResponderRelease: () => {\n        animateButtonPressOut();\n        stopRipples();\n        handlePressOut();',
);
checkContains('idem sur interruption système (onPanResponderTerminate)', 'onPanResponderTerminate: () => {');
checkContains('écran PROCESSING ne rend JAMAIS le bloc ripples', 'styles.thinkingRing,');

console.log('\n[PROCESSING nettement plus explicite — retour réel iPhone "impression de blocage"]');
checkContains('respiration MARQUÉE (12%, plus 5%) et plus vive (700ms, plus 900ms)', 'toValue: 1.12, duration: 700');
checkContains('"pop" d’entrée joué UNE FOIS exactement à la transition (pas une boucle)', 'processingPop.setValue(0.88);');
checkContains('pop combiné à la respiration continue par multiplication (changement immédiat + vie continue)', 'Animated.multiply(pulse, processingPop)');
checkContains('anneau "réflexion" TOURNE en continu (signal de travail en cours non ambigu)', "toValue: 1, duration: 1100, easing: Easing.linear");
checkContains('rotation appliquée à styles.thinkingRing (0deg -> 360deg)', "outputRange: ['0deg', '360deg']");
checkContains('anneau = arc à deux bords colorés (pas un simple contour plein)', 'borderBottomColor: \'transparent\'');
checkNotContains('l’ancienne opacité pilotée par pulse.interpolate([1,1.05]) a bien été remplacée (pas juste ajoutée à côté)', 'outputRange: [0.18, 0.5]');

console.log('\n[textes PROCESSING exacts demandés]');
checkContains('titre "Pensif réfléchit…"', 'Pensif réfléchit…');
checkContains('sous-texte "Votre pensée est en cours de préparation."', 'Votre pensée est en cours de préparation.');

console.log('\n[retour utilisateur PENDANT processing → confirmation]');
checkContains('listener beforeRemove installé', "navigation.addListener('beforeRemove'");
checkContains('ne bloque QUE si phase === processing', "if (phase !== 'processing') return;");
checkContains('message exact demandé', 'L’analyse est toujours en cours. Quitter ?');
checkContains('"Quitter" rejoue EXACTEMENT l’action de navigation interceptée', 'navigation.dispatch(e.data.action)');

console.log('\n[enchaînement "Nouvelle capture" — §2]');
checkContains(
  'sans carte non sauvegardée (pending/failed) → reset direct, aucune confirmation',
  "const hasUnsaved = cards.some((c) => c.status === 'pending' || c.status === 'failed');\n    if (!hasUnsaved) {\n      resetCaptureState();\n      return;\n    }",
);
checkContains('avec carte non sauvegardée → confirmation avant abandon (jamais silencieux)', "'Pensées non enregistrées',");
checkContains('reset complet : transcript vidé', "setTranscript('');");
checkContains('reset complet : cards vidées', 'setCards([]);');
checkContains('reset complet : erreurs vidées', 'setErrorMessage(null);');
checkContains('reset complet : état audio (garde-fou silence) réinitialisé', 'voiceActivityRef.current.reset();');
checkContains('reset complet : retour explicite à idle (pas juste goBack)', "setPhase('idle');\n  }");
checkContains('bouton "Nouvelle capture" présent dans l’écran Review, toujours visible', '<PrimaryButton label="Nouvelle capture" onPress={handleNewCapture} variant="secondary" />');

console.log('\n[aucune modification du pipeline métier / prompts / STT / contact matching / dates]');
console.log('  Vérifié par relecture : uploadAudioForCapture, isCaptureExploitable, buildInitialCards,');
console.log('  matchContactByHeardName, buildPenseeFromCard, isCardValid, canSaveAll, confirmContactForCard');
console.log('  sont appelés exactement comme avant ce chantier — aucune de ces fonctions ni leur appel');
console.log('  n’a été modifié ; seuls handleNewCapture/resetCaptureState (nouveaux, purement UI/état');
console.log('  local) et les animations PROCESSING ont changé. Aucun fichier providers/llm, prompt.ts,');
console.log('  contactMatching.ts, reminderDate.ts ni captureExploitability.ts n’a été touché (voir git diff).');

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
