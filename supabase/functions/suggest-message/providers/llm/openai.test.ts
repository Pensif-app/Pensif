// Tests purs (aucun réseau) — construction du corps de requête OpenAI pour suggest-message.
// Validation sémantique réelle via le benchmark dédié (scripts/benchmark-suggest-message-*.ts),
// qui nécessite un vrai appel réseau et donc une clé API.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildOpenaiRequestBody, SUGGEST_MESSAGE_JSON_SCHEMA } from './openai.ts';
import { MessageSuggestionContext } from '../../contract.ts';

const CONTEXT: MessageSuggestionContext = {
  contact: { prenom: 'Yohan', genre: 'homme', relation: 'Famille', familyRole: 'Frère' },
  occasion: { occasion: 'birthday', daysUntil: 3 },
  quiz: null,
  pensees: { optional: true, items: [] },
};

Deno.test('buildOpenaiRequestBody — max_completion_tokens = 1200 (correctif 2026-09-16, diagnostic budget de sortie)', () => {
  const body = buildOpenaiRequestBody(CONTEXT, 'chaleureux', 'gpt-5-mini');
  assertEquals(body.max_completion_tokens, 1200);
});

Deno.test('buildOpenaiRequestBody — reasoning_effort présent pour un modèle gpt-5*, défaut "low"', () => {
  Deno.env.delete('SUGGEST_MESSAGE_REASONING_EFFORT');
  const body = buildOpenaiRequestBody(CONTEXT, 'chaleureux', 'gpt-5-mini');
  assertEquals(body.reasoning_effort, 'low');
});

Deno.test('buildOpenaiRequestBody — SUGGEST_MESSAGE_REASONING_EFFORT surcharge le défaut, jamais OPENAI_REASONING_EFFORT (variable de Capture)', () => {
  Deno.env.set('OPENAI_REASONING_EFFORT', 'medium'); // variable de CAPTURE — ne doit jamais influencer suggest-message
  try {
    const body = buildOpenaiRequestBody(CONTEXT, 'chaleureux', 'gpt-5-mini');
    assertEquals(body.reasoning_effort, 'low', 'suggest-message ne doit jamais lire OPENAI_REASONING_EFFORT (variable dédiée à Capture)');
  } finally {
    Deno.env.delete('OPENAI_REASONING_EFFORT');
  }
});

Deno.test('buildOpenaiRequestBody — pas de reasoning_effort pour un modèle non gpt-5*', () => {
  const body = buildOpenaiRequestBody(CONTEXT, 'chaleureux', 'gpt-4o');
  assert(!('reasoning_effort' in body), 'reasoning_effort ne doit pas être envoyé à un modèle qui ne le supporte pas');
});

Deno.test('buildOpenaiRequestBody — utilise le schéma JSON strict { message: string }', () => {
  const body = buildOpenaiRequestBody(CONTEXT, 'chaleureux', 'gpt-5-mini') as { response_format: { json_schema: unknown } };
  assertEquals(body.response_format.json_schema, SUGGEST_MESSAGE_JSON_SCHEMA);
});

Deno.test('buildOpenaiRequestBody — messages system puis user, dans cet ordre', () => {
  const body = buildOpenaiRequestBody(CONTEXT, 'chaleureux', 'gpt-5-mini') as { messages: { role: string; content: string }[] };
  assertEquals(body.messages[0].role, 'system');
  assertEquals(body.messages[1].role, 'user');
  assert(body.messages[1].content.includes('Yohan'), 'le prompt utilisateur doit contenir les faits du contexte');
});
