// Adaptateur LLM — API Messages d'Anthropic. Un exemple câblé pour rendre le pipeline testable de
// bout en bout — PAS un choix final (voir consigne du chantier : benchmark coût/qualité FR/latence
// à faire avant de figer un fournisseur). Le modèle vient de LLM_MODEL, jamais hardcodé ici.
import { TemporalContext } from '../../../_shared/captureContract.ts';
import { LlmOptions, LlmProvider } from './types.ts';
import { buildExtractionPrompt } from './prompt.ts';

export const anthropicLlmProvider: LlmProvider = {
  name: 'anthropic',
  async extract(transcript: string, context: TemporalContext, options: LlmOptions): Promise<unknown> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant (secret Supabase requis pour LLM_PROVIDER=anthropic)');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: buildExtractionPrompt(transcript, context) }],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Anthropic LLM a échoué (${response.status}): ${body}`);
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const textBlock = data.content?.find((block) => block.type === 'text' && typeof block.text === 'string');
    if (!textBlock?.text) {
      throw new Error('Réponse Anthropic inattendue (aucun bloc texte)');
    }
    // Le prompt exige un JSON pur, mais on tolère un fencing ```json``` accidentel plutôt que de
    // faire échouer toute la requête pour un détail de formatage.
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    try {
      return JSON.parse(cleaned);
    } catch {
      // Un JSON illisible n'est PAS une erreur réseau/API — c'est une sortie invalide, à faire
      // gérer par validate.ts (repli transcript brut), pas une exception qui casserait la requête.
      return null;
    }
  },
};
