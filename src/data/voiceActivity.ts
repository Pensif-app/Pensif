// CHANTIER CAPTURE INTELLIGENTE — garde-fou NIVEAU 1 (avant STT) : décide, à partir du vrai
// metering audio d'expo-audio (dBFS réel — jamais simulé), si une vraie voix a été détectée
// pendant l'enregistrement. Si non, `CaptureScreen.tsx` n'appelle même pas `uploadAudioForCapture`
// (donc jamais Groq/le STT) — voir le cas réel corrigé : silence/bruit lointain maintenu plusieurs
// secondes → le STT "hallucinait" une phrase. Pur, aucune dépendance react-native/expo, testable
// sous ts-node — la même classe est utilisée ici en test ET dans CaptureScreen (pas de logique
// dupliquée entre les deux).

// Même échelle que le lissage des anneaux (voir CaptureScreen.tsx, normalizeMetering) : plancher
// dBFS pratique (silence/bruit de fond) → plafond (voix forte).
export const VOICE_FLOOR_DB = -50;
export const VOICE_CEIL_DB = -8;
// Seuil "vraie voix" — nettement au-dessus du plancher de bruit de fond (-45/-50dB), mais pas trop
// haut pour ne pas rejeter une voix normale un peu faible.
export const VOICE_THRESHOLD_DB = -35;
// Durée cumulée minimale (pas nécessairement continue) au-dessus du seuil pour considérer qu'il y
// a eu une vraie parole — un unique pic isolé (une seule mesure) ne peut jamais l'atteindre seul.
export const VOICE_MIN_CUMULATIVE_MS = 400;
// Même lissage exponentiel que les anneaux — un pic unique d'une seule mesure est fortement
// amorti avant même d'être comparé au seuil ("ne pas compter un pic unique").
const SMOOTHING_ALPHA = 0.3;

function normalizeLevel(db: number | undefined): number {
  if (db === undefined) return 0;
  const clamped = Math.max(VOICE_FLOOR_DB, Math.min(VOICE_CEIL_DB, db));
  return (clamped - VOICE_FLOOR_DB) / (VOICE_CEIL_DB - VOICE_FLOOR_DB);
}

const VOICE_THRESHOLD_NORMALIZED = normalizeLevel(VOICE_THRESHOLD_DB);

/**
 * Accumule, échantillon après échantillon (un par poll `useAudioRecorderState`), le temps cumulé
 * passé au-dessus du seuil de voix — sur le niveau LISSÉ (pas la mesure brute), pour ignorer un
 * bruit bref ou un pic isolé sans ignorer une voix normale simplement un peu faible.
 */
export class VoiceActivityAccumulator {
  private displayLevel = 0;
  private cumulativeMs = 0;

  /** `elapsedMs` : temps réellement écoulé depuis le dernier échantillon (l'intervalle de poll). */
  addSample(db: number | undefined, elapsedMs: number): void {
    const raw = normalizeLevel(db);
    this.displayLevel = this.displayLevel * (1 - SMOOTHING_ALPHA) + raw * SMOOTHING_ALPHA;
    if (this.displayLevel >= VOICE_THRESHOLD_NORMALIZED) {
      this.cumulativeMs += Math.max(0, elapsedMs);
    }
  }

  hasDetectedVoice(): boolean {
    return this.cumulativeMs >= VOICE_MIN_CUMULATIVE_MS;
  }

  reset(): void {
    this.displayLevel = 0;
    this.cumulativeMs = 0;
  }
}
