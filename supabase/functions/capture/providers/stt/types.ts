// Interface provider-agnostique STT — aucun fournisseur (OpenAI, Groq, Deepgram...) ne doit fuiter
// au-delà de son propre adaptateur. Le modèle est toujours passé en paramètre (via STT_MODEL, voir
// index.ts), jamais hardcodé dans un adaptateur ou dans la factory.
export type SttAudioInput = {
  bytes: Uint8Array;
  mimeType: string;
  /** Nom de fichier ORIGINAL (avec extension) — certains fournisseurs (OpenAI Whisper) détectent
   *  le format audio par l'extension du nom de fichier plutôt que par le seul Content-Type. */
  filename: string;
};

export type SttOptions = {
  /** Nom du modèle à utiliser — vient de la variable d'env STT_MODEL, jamais une valeur par défaut
   *  choisie par l'adaptateur (le choix du modèle appartient à la config, pas au code). */
  model: string;
};

export interface SttProvider {
  /** Nom du fournisseur (utilisé uniquement dans `CaptureContract.meta`, informationnel). */
  readonly name: string;
  transcribe(audio: SttAudioInput, options: SttOptions): Promise<string>;
}
