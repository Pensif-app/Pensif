// Tests purs (aucun réseau) de l'adaptateur LLM OpenAI — couvre la construction du corps de requête
// (reasoning_effort par modèle/env) et le câblage du message system de renfort (figé depuis le
// benchmark #2, 9/10 — voir le commentaire d'en-tête d'openai.ts). Pas de test contre un vrai
// transcript ici : la validation sémantique réelle se fait via le benchmark
// (scripts/benchmark-capture-llm-providers.ts), qui nécessite un vrai appel réseau et donc une clé API.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildOpenaiRequestBody, OPENAI_REINFORCEMENT_SYSTEM_PROMPT, PENSEE_JSON_SCHEMA } from './openai.ts';
import { TemporalContext } from '../../../_shared/captureContract.ts';

const CONTEXT: TemporalContext = { timezone: 'Europe/Paris', localDateTime: '2026-09-18T10:00:00', weekday: 'vendredi' };

Deno.test('buildOpenaiRequestBody — ajoute reasoning_effort pour un modèle gpt-5*', () => {
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano');
  assert('reasoning_effort' in body, 'reasoning_effort doit être présent pour gpt-5*');
});

Deno.test('buildOpenaiRequestBody — reasoning_effort défaut à "low" (confirmé par benchmark : minimal=3/10, low=9/10)', () => {
  Deno.env.delete('OPENAI_REASONING_EFFORT');
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano');
  assertEquals(body.reasoning_effort, 'low');
});

Deno.test('buildOpenaiRequestBody — OPENAI_REASONING_EFFORT surcharge le défaut sans redéploiement', () => {
  Deno.env.set('OPENAI_REASONING_EFFORT', 'medium');
  try {
    const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano');
    assertEquals(body.reasoning_effort, 'medium');
  } finally {
    Deno.env.delete('OPENAI_REASONING_EFFORT');
  }
});

Deno.test('buildOpenaiRequestBody — pas de reasoning_effort pour un modèle non gpt-5*', () => {
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-4o');
  assert(!('reasoning_effort' in body), 'reasoning_effort ne doit pas être envoyé à un modèle qui ne le supporte pas');
});

Deno.test('buildOpenaiRequestBody — inclut le message system de renfort AVANT le prompt métier partagé', () => {
  const body = buildOpenaiRequestBody('mon transcript', CONTEXT, 'gpt-5-nano') as { messages: { role: string; content: string }[] };
  assertEquals(body.messages[0].role, 'system');
  assertEquals(body.messages[0].content, OPENAI_REINFORCEMENT_SYSTEM_PROMPT);
  assertEquals(body.messages[1].role, 'user');
  assert(body.messages[1].content.includes('mon transcript'), 'le prompt métier partagé doit contenir le transcript');
});

Deno.test('buildOpenaiRequestBody — utilise le schéma JSON strict Structured Outputs attendu', () => {
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano') as { response_format: { json_schema: unknown } };
  assertEquals(body.response_format.json_schema, PENSEE_JSON_SCHEMA);
});

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle 5 (date+heure) au texte V2 figé (9/10) — une tentative de renfort post-benchmark a régressé et a été annulée', () => {
  assert(
    OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes(
      "5. DATE + HEURE ENSEMBLE — Si une expression de rappel contient à la fois une date/un jour ET une heure, conserve les deux dans reminder (ne perds ni l'une ni l'autre).",
    ),
    'le texte de la règle 5 doit rester exactement celui de la V2 (benchmark 9/10) — ne pas le reformuler sans nouveau benchmark',
  );
});
