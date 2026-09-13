// Tests de non-régression — CHANTIER CAPTURE INTELLIGENTE : garde-fou NIVEAU 1 (avant STT), basé
// sur le vrai metering audio (src/data/voiceActivity.ts). V2 : logique volontairement permissive
// (seuil souple + pic isolé + fail-open sur metering douteux) après un retour réel où de vraies
// phrases claires étaient rejetées par l'ancien seuil (-35dB/400ms lissé). Simule des séries de
// mesures dBFS comme celles produites par expo-audio (un échantillon par poll de METERING_POLL_MS)
// et vérifie que l'accumulateur décide correctement. Pur, sans dépendance réseau/IA/react-native.
//
// Usage : npx tsx scripts/test-regression-voice-activity.ts

import {
  VoiceActivityAccumulator,
  VOICE_THRESHOLD_DB,
  MIN_VOICE_MS,
  STRONG_PEAK_THRESHOLD_DB,
} from '../src/data/voiceActivity';

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

console.log(`\n[seuils] VOICE_THRESHOLD_DB=${VOICE_THRESHOLD_DB} MIN_VOICE_MS=${MIN_VOICE_MS} STRONG_PEAK_THRESHOLD_DB=${STRONG_PEAK_THRESHOLD_DB}`);
check('MIN_VOICE_MS dans la fourchette demandée (150-250ms)', MIN_VOICE_MS >= 150 && MIN_VOICE_MS <= 250);
check('VOICE_THRESHOLD_DB nettement plus permissif que l’ancien -35dB', VOICE_THRESHOLD_DB <= -45);

console.log('\n[A] silence total 3s → rejet local (idéalement)');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -58, 30); // 3000ms de silence bien en dessous du seuil souple (-50dB)
  check('hasLikelySpeech() = false', !acc.hasLikelySpeech());
  check('rejectReason() renseigné', acc.rejectReason() !== null);
}

console.log('\n[B] voix normale 1s → upload autorisé');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -18, 10); // 1000ms nettement au-dessus du seuil, pic franc
  check('hasLikelySpeech() = true', acc.hasLikelySpeech());
}

console.log('\n[C] voix faible 1s → upload autorisé (c’est exactement le cas régressé par l’ancien seuil -35dB)');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -45, 10); // 1000ms au-dessus du nouveau seuil (-50dB) mais qui aurait été rejeté avant
  check('hasLikelySpeech() = true', acc.hasLikelySpeech());
}

console.log('\n[D] phrase de 3-4 mots (syllabes fortes entrecoupées de courts silences) → upload autorisé');
{
  const acc = new VoiceActivityAccumulator();
  // "Mic-ka aime le ca-fé" : alternance voisé/silence, ~1.6s au total.
  feed(acc, -20, 3); // "Mic-"
  feed(acc, -55, 2); // micro-silence
  feed(acc, -22, 3); // "-ka"
  feed(acc, -55, 2);
  feed(acc, -19, 4); // "aime"
  feed(acc, -55, 2);
  feed(acc, -25, 2); // "le"
  feed(acc, -55, 2);
  feed(acc, -18, 4); // "ca-fé"
  check('hasLikelySpeech() = true', acc.hasLikelySpeech());
}

console.log('\n[E] metering indisponible (undefined) → fail-open, upload autorisé');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, undefined, 30); // 3000ms sans aucune mesure exploitable
  check('hasLikelySpeech() = true (fail-open)', acc.hasLikelySpeech());
  check('rejectReason() = null (jamais de raison de rejet en fail-open)', acc.rejectReason() === null);
}
console.log('\n[E-bis] metering indisponible sur une PORTION significative (>50%) → fail-open aussi');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -58, 5); // 500ms de silence mesuré
  feed(acc, undefined, 10); // 1000ms sans mesure — 66% de l’enregistrement indisponible
  check('hasLikelySpeech() = true (fail-open, metering pas assez fiable)', acc.hasLikelySpeech());
}
console.log('\n[E-ter] metering disponible sur la quasi-totalité, silence réel → PAS de fail-open, rejet normal');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -58, 29);
  feed(acc, undefined, 1); // 1 seul échantillon manquant sur 30 — largement sous le seuil de fail-open
  check('hasLikelySpeech() = false (metering assez fiable pour trancher)', !acc.hasLikelySpeech());
}

console.log('\n[F] un seul petit clic/bruit ponctuel (bref, pas franchement fort) → rejet si possible');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -55, 10); // silence avant
  acc.addSample(-30, POLL_MS); // un clic bref, sous STRONG_PEAK_THRESHOLD_DB, une seule mesure
  feed(acc, -55, 20); // silence après
  check('hasLikelySpeech() = false', !acc.hasLikelySpeech());
}

console.log('\n[reset] reset() efface bien l’accumulation précédente (nouvelle prise)');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -18, 10);
  check('voix détectée avant reset', acc.hasLikelySpeech());
  acc.reset();
  feed(acc, -58, 5); // pas assez pour un verdict de silence fiable après reset (peu d’échantillons)
  const snap = acc.debugSnapshot();
  check('compteurs bien repartis de zéro après reset', snap.recordingDurationMs === 500 && snap.voicedDurationMs === 0);
}

console.log('\n[debugSnapshot] expose toutes les métriques demandées');
{
  const acc = new VoiceActivityAccumulator();
  feed(acc, -40, 5);
  feed(acc, -20, 3);
  const snap = acc.debugSnapshot();
  check('recordingDurationMs présent', typeof snap.recordingDurationMs === 'number');
  check('peakDb présent', typeof snap.peakDb === 'number');
  check('voicedDurationMs présent', typeof snap.voicedDurationMs === 'number');
  check('minDb/maxDb présents', typeof snap.minDb === 'number' && typeof snap.maxDb === 'number');
  check('hasLikelySpeech présent', typeof snap.hasLikelySpeech === 'boolean');
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
