// Tests de non-régression — CHANTIER CAPTURE INTELLIGENTE : garde-fou NIVEAU 1 (avant STT), basé
// sur le vrai metering audio (src/data/voiceActivity.ts). Simule des séries de mesures dBFS comme
// celles produites par expo-audio (un échantillon par poll de METERING_POLL_MS) et vérifie que
// l'accumulateur décide correctement si une vraie voix a été détectée. Pur, sans dépendance
// réseau/IA/react-native.
//
// Usage : npx tsx scripts/test-regression-voice-activity.ts

import { VoiceActivityAccumulator, VOICE_MIN_CUMULATIVE_MS } from '../src/data/voiceActivity';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const POLL_MS = 100;

/** Simule N échantillons consécutifs à `db`, chacun espacé de POLL_MS (comme le vrai poll). */
function feed(acc: VoiceActivityAccumulator, db: number | undefined, count: number) {
  for (let i = 0; i < count; i++) acc.addSample(db, POLL_MS);
}

console.log(`\n[seuil] VOICE_MIN_CUMULATIVE_MS = ${VOICE_MIN_CUMULATIVE_MS}ms (fourchette demandée : 300-500ms)`);
check('dans la fourchette demandée', VOICE_MIN_CUMULATIVE_MS >= 300 && VOICE_MIN_CUMULATIVE_MS <= 500);

console.log('\n[1] silence total 3s → aucune voix détectée');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -55, 30); // 3000ms de silence bien en dessous du plancher
  check('hasDetectedVoice() = false', !acc.hasDetectedVoice());
}

console.log('\n[2] petit bruit bref (1 seule mesure au-dessus du seuil) → aucune voix détectée (pas de pic isolé compté)');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -50, 10); // silence avant
  acc.addSample(-20, POLL_MS); // un seul pic isolé (100ms)
  feed(acc, -50, 20); // silence après
  check('hasDetectedVoice() = false', !acc.hasDetectedVoice());
}

console.log('\n[3] voix normale soutenue 1s → voix détectée, upload autorisé');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -20, 10); // 1000ms nettement au-dessus du seuil (-35dB)
  check('hasDetectedVoice() = true', acc.hasDetectedVoice());
}

console.log('\n[4] voix faible mais soutenue (juste au-dessus du seuil, assez longtemps) → voix détectée');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -32, 10); // 1000ms juste au-dessus de -35dB, laisse le temps au lissage de monter
  check('hasDetectedVoice() = true', acc.hasDetectedVoice());
}

console.log('\n[garde-fou] voix faible MAIS sous le seuil, même longtemps → jamais détectée (pas trop agressif dans l’autre sens : le seuil ne bouge pas)');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -40, 50); // 5000ms sous le seuil (-35dB) : bruit de fond un peu élevé, jamais de la voix
  check('hasDetectedVoice() = false', !acc.hasDetectedVoice());
}

console.log('\n[reset] reset() efface bien l’accumulation précédente (nouvelle prise)');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -20, 10);
  check('voix détectée avant reset', acc.hasDetectedVoice());
  acc.reset();
  check('plus de voix détectée juste après reset', !acc.hasDetectedVoice());
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
