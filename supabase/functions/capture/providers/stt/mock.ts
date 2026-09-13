// Adaptateur STT factice — aucun réseau, aucun secret requis. Traite les octets audio comme s'ils
// ÉTAIENT déjà le texte transcrit (encodage UTF-8 direct) : sert uniquement à tester
// l'orchestration/la validation de bout en bout (voir capture/index.test.ts) sans dépendre d'un
// vrai fournisseur ni de vraies clés API.
import { SttAudioInput, SttOptions, SttProvider } from './types.ts';

export const mockSttProvider: SttProvider = {
  name: 'mock',
  async transcribe(audio: SttAudioInput, _options: SttOptions): Promise<string> {
    return new TextDecoder().decode(audio.bytes);
  },
};
