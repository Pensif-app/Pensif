// Adaptateur factice — aucun réseau, aucun secret requis. Sert uniquement à tester l'orchestration
// de bout en bout (index.test.ts) sans dépendre d'un vrai fournisseur — ne PAS utiliser pour juger de
// la qualité de rédaction réelle (voir méthode de benchmark, à exécuter séparément avec de vraies clés).
import { MessageSuggestionContext, MessageTone } from '../../contract.ts';
import { LlmOptions, LlmProvider } from './types.ts';

export const mockLlmProvider: LlmProvider = {
  name: 'mock',
  async generate(context: MessageSuggestionContext, tone: MessageTone, _options: LlmOptions): Promise<unknown> {
    return { message: `[mock/${tone}] Message pour ${context.contact.prenom} (${context.occasion.occasion}).` };
  },
};
