// Adaptateur STT — API de transcription audio de Groq (compatible OpenAI : même endpoint
// /audio/transcriptions, mêmes champs multipart). Un second point de comparaison pour le benchmark
// STT (coût/qualité FR/latence) — PAS un choix final, au même titre que l'adaptateur OpenAI.
// N'importe RIEN de openai.ts (fichiers volontairement indépendants, voir consigne du chantier).
import { SttAudioInput, SttOptions, SttProvider } from './types.ts';

const MIME_TO_EXTENSION: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

/** Même précaution que l'adaptateur OpenAI (API compatible, même sensibilité probable à
 *  l'extension du nom de fichier) — voir BUG "Unrecognized/Invalid file format" du benchmark STT. */
function ensureFileNameWithExtension(filename: string, mimeType: string): string {
  if (/\.[a-zA-Z0-9]+$/.test(filename)) return filename;
  const extension = MIME_TO_EXTENSION[mimeType.toLowerCase()] ?? 'wav';
  return `${filename}.${extension}`;
}

export const groqSttProvider: SttProvider = {
  name: 'groq',
  async transcribe(audio: SttAudioInput, options: SttOptions): Promise<string> {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY manquant (secret Supabase requis pour STT_PROVIDER=groq)');

    const form = new FormData();
    form.append('model', options.model);
    const bytesCopy = new Uint8Array(audio.bytes).buffer;
    const filename = ensureFileNameWithExtension(audio.filename, audio.mimeType);
    form.append('file', new Blob([bytesCopy], { type: audio.mimeType }), filename);

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Groq STT a échoué (${response.status}): ${body}`);
    }
    const data = (await response.json()) as { text?: string };
    if (typeof data.text !== 'string') {
      throw new Error('Réponse Groq STT inattendue (champ "text" absent)');
    }
    return data.text;
  },
};
