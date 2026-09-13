// Adaptateur LLM factice — aucun réseau, aucun secret requis. Extraction volontairement simpliste
// (une seule pensée, tout le transcript comme texte, jamais de rappel/événement détecté) : sert
// uniquement à tester l'orchestration/la validation de bout en bout sans dépendre d'un vrai
// fournisseur. Ne PAS utiliser pour juger de la qualité d'extraction réelle (voir benchmark à venir).
import { TemporalContext } from '../../../_shared/captureContract.ts';
import { LlmOptions, LlmProvider } from './types.ts';

export const mockLlmProvider: LlmProvider = {
  name: 'mock',
  async extract(transcript: string, _context: TemporalContext, _options: LlmOptions): Promise<unknown> {
    return {
      pensees: [
        {
          texte: transcript,
          heardContactName: null,
          event: { hasDate: false, date: null, heardExpression: null, confidence: 1 },
          reminder: { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 1 },
          confidence: 1,
        },
      ],
    };
  },
};
