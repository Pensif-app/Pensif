// Tests Deno — orchestration HTTP complète (auth → validation → anti-abus → LLM → validation
// sortie → réponse), CaptureDeps-style injection, sans jamais toucher au réseau réel ni à un vrai
// projet Supabase. Usage : deno test supabase/functions/suggest-message/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleRequest, SuggestMessageDeps } from './index.ts';
import { mockLlmProvider } from './providers/llm/mock.ts';
import { getLlmProvider } from './providers/llm/index.ts';
import { MessageSuggestionUsageResult } from './rateLimit.ts';

const AUTHORIZED_HEADERS = { Authorization: 'Bearer test-token' };

const VALID_BODY = {
  tone: 'chaleureux',
  context: {
    contact: { prenom: 'Yohan', genre: 'homme', relation: 'Famille', familyRole: 'Frère' },
    occasion: { occasion: 'birthday', daysUntil: 3 },
    quiz: null,
    pensees: { optional: true, items: [] },
  },
};

function depsWith(overrides: Partial<SuggestMessageDeps> = {}): SuggestMessageDeps {
  return {
    verifySession: async () => ({ userId: 'user-1' }),
    getLlmProvider: () => mockLlmProvider,
    registerMessageSuggestionUsage: async () => 'ok',
    ...overrides,
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = AUTHORIZED_HEADERS): Request {
  return new Request('http://localhost/suggest-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test('405 si méthode différente de POST', async () => {
  const req = new Request('http://localhost/suggest-message', { method: 'GET' });
  const res = await handleRequest(req, depsWith());
  assertEquals(res.status, 405);
});

Deno.test('401 si aucune session (Authorization manquant)', async () => {
  const res = await handleRequest(jsonRequest(VALID_BODY, {}), depsWith({ verifySession: async () => null }));
  assertEquals(res.status, 401);
});

Deno.test('401 si verifySession rejette (JWT invalide)', async () => {
  const res = await handleRequest(jsonRequest(VALID_BODY), depsWith({ verifySession: async () => null }));
  assertEquals(res.status, 401);
});

Deno.test('400 si corps JSON invalide', async () => {
  const req = new Request('http://localhost/suggest-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...AUTHORIZED_HEADERS },
    body: '{not valid json',
  });
  const res = await handleRequest(req, depsWith());
  assertEquals(res.status, 400);
});

Deno.test('400 si contexte invalide (occasion inconnue) — jamais atteint l’anti-abus ni le LLM', async () => {
  let usageCalls = 0;
  let llmCalls = 0;
  const badBody = { ...VALID_BODY, context: { ...VALID_BODY.context, occasion: { occasion: 'noel' } } };
  const res = await handleRequest(
    jsonRequest(badBody),
    depsWith({
      registerMessageSuggestionUsage: async () => {
        usageCalls += 1;
        return 'ok';
      },
      getLlmProvider: () => ({
        name: 'spy',
        generate: async () => {
          llmCalls += 1;
          return { message: 'x' };
        },
      }),
    }),
  );
  assertEquals(res.status, 400);
  assertEquals(usageCalls, 0, 'une requête invalide ne doit jamais consommer le quota anti-abus');
  assertEquals(llmCalls, 0, 'une requête invalide ne doit jamais atteindre le LLM (protection des coûts)');
});

Deno.test('429 si anti-abus bloque (rate_limit_minute) — jamais d’appel LLM ensuite', async () => {
  let llmCalls = 0;
  const res = await handleRequest(
    jsonRequest(VALID_BODY),
    depsWith({
      registerMessageSuggestionUsage: async () => 'rate_limit_minute' as MessageSuggestionUsageResult,
      getLlmProvider: () => ({
        name: 'spy',
        generate: async () => {
          llmCalls += 1;
          return { message: 'x' };
        },
      }),
    }),
  );
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.code, 'MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE');
  assertEquals(llmCalls, 0);
});

Deno.test('429 si anti-abus bloque (rate_limit_hour)', async () => {
  const res = await handleRequest(
    jsonRequest(VALID_BODY),
    depsWith({ registerMessageSuggestionUsage: async () => 'rate_limit_hour' as MessageSuggestionUsageResult }),
  );
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.code, 'MESSAGE_SUGGESTION_RATE_LIMIT_HOUR');
});

Deno.test('429 si anti-abus bloque (monthly_cap) — jamais d’appel LLM ensuite', async () => {
  let llmCalls = 0;
  const res = await handleRequest(
    jsonRequest(VALID_BODY),
    depsWith({
      registerMessageSuggestionUsage: async () => 'monthly_cap' as MessageSuggestionUsageResult,
      getLlmProvider: () => ({
        name: 'spy',
        generate: async () => {
          llmCalls += 1;
          return { message: 'x' };
        },
      }),
    }),
  );
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.code, 'MESSAGE_SUGGESTION_MONTHLY_CAP');
  assertEquals(llmCalls, 0);
});

Deno.test('200 avec { message } en cas de succès (provider mock)', async () => {
  const res = await handleRequest(jsonRequest(VALID_BODY), depsWith());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(typeof body.message, 'string');
  assertEquals(Object.keys(body).length, 1, 'le contrat de réponse ne doit contenir QUE "message"');
});

Deno.test('502 si le LLM renvoie une sortie invalide (jamais renvoyée telle quelle au client)', async () => {
  const res = await handleRequest(
    jsonRequest(VALID_BODY),
    depsWith({ getLlmProvider: () => ({ name: 'broken', generate: async () => ({ pas_le_bon_champ: true }) }) }),
  );
  assertEquals(res.status, 502);
});

Deno.test('502 si le LLM échoue (réseau/API)', async () => {
  const res = await handleRequest(
    jsonRequest(VALID_BODY),
    depsWith({
      getLlmProvider: () => ({
        name: 'broken',
        generate: async () => {
          throw new Error('boom');
        },
      }),
    }),
  );
  assertEquals(res.status, 502);
});

Deno.test('anti-abus vérifié APRÈS la validation mais AVANT l’appel LLM (ordre exact)', async () => {
  const order: string[] = [];
  await handleRequest(
    jsonRequest(VALID_BODY),
    depsWith({
      registerMessageSuggestionUsage: async () => {
        order.push('usage');
        return 'ok';
      },
      getLlmProvider: () => ({
        name: 'spy',
        generate: async () => {
          order.push('llm');
          return { message: 'x' };
        },
      }),
    }),
  );
  assertEquals(order, ['usage', 'llm']);
});

Deno.test('factory réelle getLlmProvider("mock") fonctionne de bout en bout (pas seulement les mocks de test)', async () => {
  const res = await handleRequest(jsonRequest(VALID_BODY), depsWith({ getLlmProvider }));
  assertEquals(res.status, 200);
});

// CORRECTIF (2026-09-16) — audit pré-déploiement : les secrets Supabase sont partagés au niveau du
// PROJET ENTIER, pas isolés par fonction. `SUGGEST_MESSAGE_LLM_PROVIDER`/`SUGGEST_MESSAGE_LLM_MODEL`
// (noms DÉDIÉS) remplacent les anciens `LLM_PROVIDER`/`LLM_MODEL` génériques, qui auraient fait
// dépendre cette fonction de la configuration de Capture (et inversement) une fois déployées côte à
// côte dans le même projet Supabase.
Deno.test('lit SUGGEST_MESSAGE_LLM_PROVIDER (nom dédié), jamais LLM_PROVIDER générique', async () => {
  Deno.env.delete('LLM_PROVIDER');
  Deno.env.delete('SUGGEST_MESSAGE_LLM_PROVIDER');
  Deno.env.set('LLM_PROVIDER', 'generic-should-be-ignored');
  try {
    let receivedProviderName: string | null = null;
    Deno.env.set('SUGGEST_MESSAGE_LLM_PROVIDER', 'dedicated-provider');
    await handleRequest(
      jsonRequest(VALID_BODY),
      depsWith({
        getLlmProvider: (name) => {
          receivedProviderName = name;
          return mockLlmProvider;
        },
      }),
    );
    assertEquals(receivedProviderName, 'dedicated-provider', 'doit lire SUGGEST_MESSAGE_LLM_PROVIDER, pas LLM_PROVIDER');
  } finally {
    Deno.env.delete('LLM_PROVIDER');
    Deno.env.delete('SUGGEST_MESSAGE_LLM_PROVIDER');
  }
});

Deno.test('LLM_MODEL générique (variable de Capture) n’influence jamais le modèle utilisé ici', async () => {
  Deno.env.delete('LLM_MODEL');
  Deno.env.delete('SUGGEST_MESSAGE_LLM_MODEL');
  Deno.env.set('LLM_MODEL', 'capture-model-should-be-ignored');
  try {
    let receivedModel: string | null = null;
    Deno.env.set('SUGGEST_MESSAGE_LLM_MODEL', 'gpt-5-mini');
    await handleRequest(
      jsonRequest(VALID_BODY),
      depsWith({
        getLlmProvider: () => ({
          name: 'spy',
          generate: async (_context, _tone, options) => {
            receivedModel = options.model;
            return { message: 'x' };
          },
        }),
      }),
    );
    assertEquals(receivedModel, 'gpt-5-mini', 'doit lire SUGGEST_MESSAGE_LLM_MODEL, jamais LLM_MODEL (variable de Capture)');
  } finally {
    Deno.env.delete('LLM_MODEL');
    Deno.env.delete('SUGGEST_MESSAGE_LLM_MODEL');
  }
});

Deno.test('défaut "mock" si SUGGEST_MESSAGE_LLM_PROVIDER absent, même si LLM_PROVIDER générique est défini', async () => {
  Deno.env.delete('SUGGEST_MESSAGE_LLM_PROVIDER');
  Deno.env.set('LLM_PROVIDER', 'openai'); // ne doit jamais être lu par cette fonction
  try {
    let receivedProviderName: string | null = null;
    await handleRequest(
      jsonRequest(VALID_BODY),
      depsWith({
        getLlmProvider: (name) => {
          receivedProviderName = name;
          return mockLlmProvider;
        },
      }),
    );
    assertEquals(receivedProviderName, 'mock');
  } finally {
    Deno.env.delete('LLM_PROVIDER');
  }
});
