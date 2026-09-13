// CHANTIER CAPTURE INTELLIGENTE — garde-fou NIVEAU 1 (avant STT) : décide, à partir du vrai
// metering audio d'expo-audio (dBFS réel — jamais simulé), s'il y a PROBABLEMENT eu de la parole
// pendant l'enregistrement. Si non, `CaptureScreen.tsx` n'appelle même pas `uploadAudioForCapture`
// (donc jamais Groq/le STT). Le filtre post-STT (captureExploitability.ts) reste la seconde
// sécurité — celui-ci n'a qu'un seul travail : éviter les FAUX NÉGATIFS (rejeter une vraie voix),
// quitte à laisser passer un peu de bruit de temps en temps. Pur, aucune dépendance
// react-native/expo, testable sous ts-node — la même classe est utilisée ici en test ET dans
// CaptureScreen (pas de logique dupliquée entre les deux).
//
// BUG CORRIGÉ (retour réel : de vraies phrases claires étaient rejetées) : la V1 de ce garde-fou
// comparait un niveau LISSÉ (EMA) à -35dB pendant 400ms cumulés — trop strict pour un micro
// iPhone/une voix un peu loin/faible, et le lissage lui-même pouvait empêcher un niveau brut
// suffisant de jamais franchir le seuil. Remplacé par une logique volontairement permissive basée
// sur des mesures BRUTES (jamais lissées — voir §4 de la demande : le lissage reste réservé à
// l'animation des anneaux, une logique complètement séparée dans CaptureScreen.tsx).
export const VOICE_THRESHOLD_DB = -50; // seuil souple — nettement plus permissif que l'ancien -35dB
export const MIN_VOICE_MS = 200; // durée cumulée minimale au-dessus du seuil souple (150-250ms demandé)
export const STRONG_PEAK_THRESHOLD_DB = -20; // un pic isolé mais franc suffit à lui seul
// Si le metering est absent (undefined) sur une part significative de l'enregistrement, on ne peut
// rien conclure de fiable — fail-open : on considère qu'il y a probablement eu de la voix plutôt que
// de risquer de bloquer une vraie dictée à cause d'un metering douteux (voir §6 de la demande).
export const UNDEFINED_FRACTION_FAIL_OPEN = 0.5;

export type VoiceActivityDebugSnapshot = {
  recordingDurationMs: number;
  voicedDurationMs: number;
  peakDb: number | null;
  minDb: number | null;
  maxDb: number | null;
  undefinedMs: number;
  meteringUnreliable: boolean;
  hasLikelySpeech: boolean;
  rejectReason: string | null;
};

/**
 * Accumule, échantillon après échantillon (un par poll `useAudioRecorderState`), les mesures BRUTES
 * nécessaires à `hasLikelySpeech()` : durée cumulée au-dessus d'un seuil souple, pic maximum observé,
 * et part de l'enregistrement où le metering était indisponible (pour le fail-open).
 */
export class VoiceActivityAccumulator {
  private recordingDurationMs = 0;
  private undefinedMs = 0;
  private voicedDurationMs = 0;
  private peakDb = -Infinity;
  private minDb = Infinity;
  private maxDb = -Infinity;

  /** `elapsedMs` : temps réellement écoulé depuis le dernier échantillon (l'intervalle de poll). */
  addSample(db: number | undefined, elapsedMs: number): void {
    const e = Math.max(0, elapsedMs);
    this.recordingDurationMs += e;
    if (db === undefined) {
      this.undefinedMs += e;
      return;
    }
    if (db > this.peakDb) this.peakDb = db;
    if (db < this.minDb) this.minDb = db;
    if (db > this.maxDb) this.maxDb = db;
    if (db >= VOICE_THRESHOLD_DB) this.voicedDurationMs += e;
  }

  /** Le metering est-il exploitable sur une part suffisante de l'enregistrement ? */
  private meteringReliable(): boolean {
    if (this.recordingDurationMs === 0) return false;
    return this.undefinedMs / this.recordingDurationMs < UNDEFINED_FRACTION_FAIL_OPEN;
  }

  /**
   * Autorise l'upload si AU MOINS UNE condition robuste indique une voix probable — voix soutenue
   * (même faible) OU un pic isolé mais franc — ou si le metering n'est pas assez fiable pour
   * trancher (fail-open, voir §6 : ne jamais bloquer une vraie dictée à cause d'un metering douteux).
   */
  hasLikelySpeech(): boolean {
    if (!this.meteringReliable()) return true;
    return this.voicedDurationMs >= MIN_VOICE_MS || this.peakDb >= STRONG_PEAK_THRESHOLD_DB;
  }

  /** Raison exacte du rejet, pour les logs DEBUG — `null` si l'upload est autorisé. */
  rejectReason(): string | null {
    if (this.hasLikelySpeech()) return null;
    return `aucune voix probable : voicedDurationMs=${this.voicedDurationMs}ms < ${MIN_VOICE_MS}ms et peakDb=${this.peakDb.toFixed(1)} < ${STRONG_PEAK_THRESHOLD_DB}`;
  }

  /** Instantané complet pour les logs DEBUG (voir CaptureScreen.tsx, uniquement en __DEV__). */
  debugSnapshot(): VoiceActivityDebugSnapshot {
    return {
      recordingDurationMs: this.recordingDurationMs,
      voicedDurationMs: this.voicedDurationMs,
      peakDb: this.peakDb === -Infinity ? null : this.peakDb,
      minDb: this.minDb === Infinity ? null : this.minDb,
      maxDb: this.maxDb === -Infinity ? null : this.maxDb,
      undefinedMs: this.undefinedMs,
      meteringUnreliable: !this.meteringReliable(),
      hasLikelySpeech: this.hasLikelySpeech(),
      rejectReason: this.rejectReason(),
    };
  }

  reset(): void {
    this.recordingDurationMs = 0;
    this.undefinedMs = 0;
    this.voicedDurationMs = 0;
    this.peakDb = -Infinity;
    this.minDb = Infinity;
    this.maxDb = -Infinity;
  }
}
