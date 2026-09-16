// Adaptateur LLM — API Chat Completions d'OpenAI, Structured Outputs. CHANTIER RÉPONSES
// INTELLIGENTES, incrément 1 (2026-09-16). Le modèle vient TOUJOURS de `options.model` (LLM_MODEL
// côté index.ts) — jamais figé ici, précisément pour pouvoir comparer gpt-5-nano et gpt-5-mini sur le
// même code sans le modifier (voir méthode de benchmark décrite dans le rapport du chantier).
//
// Totalement indépendant de supabase/functions/capture/providers/llm/openai.ts : même style d'appel
// (Chat Completions + Structured Outputs + reasoning_effort pour gpt-5*), mais son propre schéma, son
// propre prompt, sa propre variable d'environnement de clé — aucun fichier partagé entre les deux
// sinon `_shared/supabaseEnv.ts` (résolution générique des clés Supabase, pas une logique métier).
import { MessageSuggestionContext, MessageTone } from '../../contract.ts';
import { buildSystemPrompt, buildUserPrompt } from '../../prompt.ts';
import { LlmOptions, LlmProvider } from './types.ts';

// Schéma JSON strict — reflète EXACTEMENT le contrat `{ message: string }` (contract.ts). Un seul
// champ, donc un schéma volontairement minimal — pas de sur-ingénierie au-delà de ce qui est demandé.
export const SUGGEST_MESSAGE_JSON_SCHEMA = {
  name: 'suggest_message',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Le message final, prêt à être envoyé tel quel, en français, respectant strictement les règles du prompt système.',
      },
    },
    required: ['message'],
    additionalProperties: false,
  },
} as const;

/** Même logique que capture/providers/llm/openai.ts : gpt-5* accepte reasoning_effort, les autres
 *  modèles (ex. gpt-4o) non — testé au moment de benchmarker nano vs mini plutôt que supposé. */
function isGpt5Family(model: string): boolean {
  return model.toLowerCase().startsWith('gpt-5');
}

function resolveReasoningEffort(): string {
  // Variable DÉDIÉE (pas OPENAI_REASONING_EFFORT, déjà utilisée par Capture) — un ajustement pour
  // cette fonctionnalité ne doit jamais changer le comportement de Capture, et inversement.
  return Deno.env.get('SUGGEST_MESSAGE_REASONING_EFFORT') ?? 'low';
}

/** Extrait pour être réutilisé TEL QUEL par le futur script de benchmark, comme
 *  buildOpenaiRequestBody côté Capture — aucune divergence possible entre ce qui est mesuré et ce
 *  qui tourne réellement en production. */
export function buildOpenaiRequestBody(context: MessageSuggestionContext, tone: MessageTone, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(context, tone) },
    ],
    response_format: { type: 'json_schema', json_schema: SUGGEST_MESSAGE_JSON_SCHEMA },
    // CORRECTIF (2026-09-16) — 400 était insuffisant : pour un modèle "reasoning" (gpt-5*), cette
    // limite borne la SOMME des tokens de raisonnement internes (invisibles) ET du texte visible, pas
    // seulement le message final (voir run diagnostic, scripts/benchmark-suggest-message-llm-models.ts
    // — finish_reason="length" systématique à 400, budget de raisonnement seul suffisant à épuiser la
    // limite). 1200 retenu après ce diagnostic — ne concerne QUE suggest-message, jamais les
    // paramètres de Capture (capture/providers/llm/openai.ts, inchangé, budget 2048 propre à son
    // propre besoin).
    max_completion_tokens: 1200,
  };
  if (isGpt5Family(model)) {
    body.reasoning_effort = resolveReasoningEffort();
  }
  return body;
}

export const openaiLlmProvider: LlmProvider = {
  name: 'openai',
  async generate(context: MessageSuggestionContext, tone: MessageTone, options: LlmOptions): Promise<unknown> {
    // Variable DÉDIÉE (pas OPENAI_API_KEY partagée avec Capture) — permet de révoquer/faire tourner
    // la clé de l'une sans jamais interrompre l'autre.
    const apiKey = Deno.env.get('SUGGEST_MESSAGE_OPENAI_API_KEY');
    if (!apiKey) throw new Error('SUGGEST_MESSAGE_OPENAI_API_KEY manquant (secret Supabase requis pour LLM_PROVIDER=openai)');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildOpenaiRequestBody(context, tone, options.model)),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`OpenAI a échoué (${response.status}): ${errBody}`);
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Réponse OpenAI inattendue (aucun contenu message)');
    try {
      return JSON.parse(content);
    } catch {
      // JSON illisible = sortie invalide, pas une erreur réseau — laissé à validate.ts.
      return null;
    }
  },
};
