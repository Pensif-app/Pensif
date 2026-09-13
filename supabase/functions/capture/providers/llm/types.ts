// Interface provider-agnostique LLM. Retourne du JSON BRUT NON FIABLE (`unknown`) — c'est
// validate.ts, jamais l'adaptateur ni la factory, qui décide de ce qui est exploitable. Le modèle
// vient toujours de LLM_MODEL (voir index.ts), jamais hardcodé dans un adaptateur.
import { TemporalContext } from '../../../_shared/captureContract.ts';

export type LlmOptions = {
  model: string;
};

export interface LlmProvider {
  readonly name: string;
  /** Retourne le JSON déjà parsé (mais non validé) tel que produit par le LLM — ou lève en cas
   *  d'échec réseau/API (distinct d'une sortie simplement invalide, voir validate.ts). */
  extract(transcript: string, context: TemporalContext, options: LlmOptions): Promise<unknown>;
}
