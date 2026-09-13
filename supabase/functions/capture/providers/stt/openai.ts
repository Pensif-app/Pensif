// Adaptateur STT — API de transcription audio d'OpenAI (endpoint générique, fonctionne aussi bien
// pour whisper-1 que pour un futur modèle de transcription OpenAI — le nom du modèle est fourni
// par STT_MODEL, jamais hardcodé ici). Un exemple câblé pour rendre le pipeline testable de bout en
// bout — PAS un choix final (voir consigne du chantier : benchmark à faire avant de figer).
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

/** OpenAI détecte le format audio par l'EXTENSION du nom de fichier (pas seulement le
 *  Content-Type) — voir BUG "Unrecognized file format" rencontré lors du benchmark STT réel avec
 *  10 fichiers .m4a authentiques, qui échouaient tous car le nom envoyé était codé en dur sans
 *  extension. Si le nom fourni n'a déjà une extension exploitable, on en déduit une du mimeType. */
function ensureFileNameWithExtension(filename: string, mimeType: string): string {
  if (/\.[a-zA-Z0-9]+$/.test(filename)) return filename;
  const extension = MIME_TO_EXTENSION[mimeType.toLowerCase()] ?? 'wav';
  return `${filename}.${extension}`;
}

export const openaiSttProvider: SttProvider = {
  name: 'openai',
  async transcribe(audio: SttAudioInput, options: SttOptions): Promise<string> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY manquant (secret Supabase requis pour STT_PROVIDER=openai)');

    const form = new FormData();
    form.append('model', options.model);
    // Copie défensive dans un ArrayBuffer autonome : `audio.bytes` peut être une vue sur un buffer
    // partagé/décalé (TS le type large, `ArrayBufferLike`), alors que `Blob` exige un `ArrayBuffer`
    // concret.
    const bytesCopy = new Uint8Array(audio.bytes).buffer;
    const filename = ensureFileNameWithExtension(audio.filename, audio.mimeType);
    form.append('file', new Blob([bytesCopy], { type: audio.mimeType }), filename);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenAI STT a échoué (${response.status}): ${body}`);
    }
    const data = (await response.json()) as { text?: string };
    if (typeof data.text !== 'string') {
      throw new Error('Réponse OpenAI STT inattendue (champ "text" absent)');
    }
    return data.text;
  },
};
