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

// CHANTIER "Capture bloquante — diagnostic parseError" (2026-09-18), priorité 3. Catégorie GROSSIÈRE
// et NON SENSIBLE de la raison d'un échec — jamais de transcript/prompt/contenu LLM/donnée contact,
// uniquement une étiquette technique. Volontairement partagée par TOUS les providers LLM (pas
// seulement openai.ts) : un futur adaptateur (anthropic.ts, etc.) peut lever une `LlmExtractionError`
// pour bénéficier de la même catégorisation, sans y être obligé (voir `'unknown'`, catégorie de repli
// pour toute exception qui n'est pas explicitement typée).
export type LlmFailureCategory = 'llm_http' | 'llm_network' | 'empty_content' | 'json_parse';

/** Exception LEVÉE PAR UN PROVIDER (jamais construite ailleurs) pour porter sa catégorie d'échec
 *  jusqu'à `index.ts`, qui la reporte dans `CaptureContract.parseErrorCategory` — voir
 *  buildCaptureContract, validate.ts. Un provider qui lève une `Error` normale (au lieu de celle-ci)
 *  reste géré exactement comme avant (catégorie `'unknown'` côté index.ts) — AUCUN comportement
 *  existant ne dépend de ce typage, purement additif. */
export class LlmExtractionError extends Error {
  constructor(message: string, public readonly category: LlmFailureCategory) {
    super(message);
  }
}
