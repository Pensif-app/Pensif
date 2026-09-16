// Interface provider-agnostique — CHANTIER RÉPONSES INTELLIGENTES, incrément 1. Retourne du JSON
// BRUT NON FIABLE (`unknown`) — c'est validate.ts, jamais l'adaptateur, qui décide de ce qui est
// exploitable. Le modèle vient TOUJOURS de LLM_MODEL (voir index.ts), jamais figé/hardcodé dans un
// adaptateur — condition nécessaire pour pouvoir benchmarker gpt-5-nano vs gpt-5-mini (ou tout autre
// modèle futur) sans changement de code, uniquement une variable d'environnement.
import { MessageSuggestionContext, MessageTone } from '../../contract.ts';

export type LlmOptions = {
  model: string;
};

export interface LlmProvider {
  readonly name: string;
  generate(context: MessageSuggestionContext, tone: MessageTone, options: LlmOptions): Promise<unknown>;
}
