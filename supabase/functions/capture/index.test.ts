// Tests Deno — CHANTIER CAPTURE INTELLIGENTE : orchestration HTTP complète (auth → parsing →
// STT → LLM → validation → réponse), sans jamais toucher au réseau réel ni à un vrai projet
// Supabase — `CaptureDeps` est entièrement injectée. Usage : deno test supabase/functions/capture/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { CaptureDeps, handleRequest } from './index.ts';
import { SttProvider } from './providers/stt/types.ts';
import { LlmProvider } from './providers/llm/types.ts';
import { mockSttProvider } from './providers/stt/mock.ts';
import { mockLlmProvider } from './providers/llm/mock.ts';
import { getSttProvider } from './providers/stt/index.ts';
import { getLlmProvider } from './providers/llm/index.ts';

const AUTHORIZED_HEADERS = { Authorization: 'Bearer test-token' };
const VALID_CONTEXT = { timezone: 'Europe/Paris', localDateTime: '2026-09-14T10:30:00' };

function depsWith(overrides: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    verifySession: async () => ({ userId: 'user-1' }),
    getSttProvider: () => mockSttProvider,
    getLlmProvider: () => mockLlmProvider,
    ...overrides,
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = AUTHORIZED_HEADERS): Request {
  return new Request('http://localhost/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test('401 si aucune session (Authorization manquant)', async () => {
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }, {}),
    depsWith({ verifySession: async () => null }),
  );
  assertEquals(res.status, 401);
});

Deno.test('401 si verifySession rejette (JWT invalide)', async () => {
  const res = await handleRequest(jsonRequest({ transcript: 'x', context: VALID_CONTEXT }), depsWith({ verifySession: async () => null }));
  assertEquals(res.status, 401);
});

Deno.test('mode transcript (JSON) : bypass STT, appelle directement le LLM, 200 avec pensées', async () => {
  const res = await handleRequest(jsonRequest({ transcript: 'Micka aime le café', context: VALID_CONTEXT }), depsWith());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.transcript, 'Micka aime le café');
  assertEquals(body.parseError, null);
  assertEquals(body.pensees.length, 1);
  assertEquals(body.meta.sttProvider, 'mock');
  assertEquals(body.meta.llmProvider, 'mock');
});

Deno.test('400 si transcript manquant/vide en JSON', async () => {
  const res = await handleRequest(jsonRequest({ context: VALID_CONTEXT }), depsWith());
  assertEquals(res.status, 400);
  const res2 = await handleRequest(jsonRequest({ transcript: '  ', context: VALID_CONTEXT }), depsWith());
  assertEquals(res2.status, 400);
});

Deno.test('400 si "audio" présent dans le corps JSON (doit passer par multipart)', async () => {
  const res = await handleRequest(jsonRequest({ audio: { base64: 'xxx' }, context: VALID_CONTEXT }), depsWith());
  assertEquals(res.status, 400);
});

Deno.test('400 si context invalide/manquant', async () => {
  const res = await handleRequest(jsonRequest({ transcript: 'x' }), depsWith());
  assertEquals(res.status, 400);
  const res2 = await handleRequest(jsonRequest({ transcript: 'x', context: { timezone: 'Europe/Paris' } }), depsWith());
  assertEquals(res2.status, 400);
});

Deno.test('multipart : audio réel → STT (mock) puis LLM (mock), 200 avec transcript décodé', async () => {
  const form = new FormData();
  form.append('audio', new Blob([new TextEncoder().encode('transcript simulé depuis audio')], { type: 'text/plain' }), 'audio.wav');
  form.append('context', JSON.stringify(VALID_CONTEXT));
  const req = new Request('http://localhost/capture', { method: 'POST', headers: AUTHORIZED_HEADERS, body: form });

  const res = await handleRequest(req, depsWith());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.transcript, 'transcript simulé depuis audio');
  assertEquals(body.parseError, null);
});

Deno.test('multipart : champ "audio" manquant → 400', async () => {
  const form = new FormData();
  form.append('context', JSON.stringify(VALID_CONTEXT));
  const req = new Request('http://localhost/capture', { method: 'POST', headers: AUTHORIZED_HEADERS, body: form });
  const res = await handleRequest(req, depsWith());
  assertEquals(res.status, 400);
});

Deno.test('multipart : champ "transcript" présent → 400 (mode test réservé au JSON)', async () => {
  const form = new FormData();
  form.append('audio', new Blob([new TextEncoder().encode('x')]), 'audio.wav');
  form.append('transcript', 'ne devrait pas être accepté ici');
  form.append('context', JSON.stringify(VALID_CONTEXT));
  const req = new Request('http://localhost/capture', { method: 'POST', headers: AUTHORIZED_HEADERS, body: form });
  const res = await handleRequest(req, depsWith());
  assertEquals(res.status, 400);
});

Deno.test('502 si le STT échoue (audio inexploitable)', async () => {
  const failingStt: SttProvider = {
    name: 'broken',
    transcribe: async () => {
      throw new Error('panne réseau simulée');
    },
  };
  const form = new FormData();
  form.append('audio', new Blob([new TextEncoder().encode('x')]), 'audio.wav');
  form.append('context', JSON.stringify(VALID_CONTEXT));
  const req = new Request('http://localhost/capture', { method: 'POST', headers: AUTHORIZED_HEADERS, body: form });

  const res = await handleRequest(req, depsWith({ getSttProvider: () => failingStt }));
  assertEquals(res.status, 502);
});

Deno.test('200 avec parseError si le LLM échoue — le transcript déjà obtenu est quand même renvoyé', async () => {
  const failingLlm: LlmProvider = {
    name: 'broken',
    extract: async () => {
      throw new Error('API LLM indisponible');
    },
  };
  const res = await handleRequest(
    jsonRequest({ transcript: 'Le transcript doit survivre', context: VALID_CONTEXT }),
    depsWith({ getLlmProvider: () => failingLlm }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.transcript, 'Le transcript doit survivre');
  assertEquals(body.pensees.length, 0);
  assertEquals(typeof body.parseError, 'string');
});

Deno.test('200 avec parseError si le LLM renvoie un JSON inexploitable — repli transcript brut', async () => {
  const garbageLlm: LlmProvider = { name: 'garbage', extract: async () => ({ n_importe_quoi: true }) };
  const res = await handleRequest(
    jsonRequest({ transcript: 'audio incompréhensible', context: VALID_CONTEXT }),
    depsWith({ getLlmProvider: () => garbageLlm }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.transcript, 'audio incompréhensible');
  assertEquals(body.pensees.length, 0);
  assertEquals(typeof body.parseError, 'string');
});

Deno.test('500 server_misconfigured si STT_PROVIDER (réel, via env) est inconnu', async () => {
  const previous = Deno.env.get('STT_PROVIDER');
  Deno.env.set('STT_PROVIDER', 'un-fournisseur-qui-n-existe-pas');
  try {
    const res = await handleRequest(jsonRequest({ transcript: 'x', context: VALID_CONTEXT }), depsWith({ getSttProvider, getLlmProvider }));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, 'server_misconfigured');
  } finally {
    if (previous === undefined) Deno.env.delete('STT_PROVIDER');
    else Deno.env.set('STT_PROVIDER', previous);
  }
});

Deno.test('405 si méthode non POST', async () => {
  const req = new Request('http://localhost/capture', { method: 'GET', headers: AUTHORIZED_HEADERS });
  const res = await handleRequest(req, depsWith());
  assertEquals(res.status, 405);
});

Deno.test('400 si Content-Type non supporté', async () => {
  const req = new Request('http://localhost/capture', {
    method: 'POST',
    headers: { ...AUTHORIZED_HEADERS, 'content-type': 'text/plain' },
    body: 'salut',
  });
  const res = await handleRequest(req, depsWith());
  assertEquals(res.status, 400);
});
