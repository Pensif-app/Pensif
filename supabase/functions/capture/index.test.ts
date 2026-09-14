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
import { CaptureUsageResult } from './rateLimit.ts';

const AUTHORIZED_HEADERS = { Authorization: 'Bearer test-token' };
const VALID_CONTEXT = { timezone: 'Europe/Paris', localDateTime: '2026-09-14T10:30:00' };

function depsWith(overrides: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    verifySession: async () => ({ userId: 'user-1' }),
    getSttProvider: () => mockSttProvider,
    getLlmProvider: () => mockLlmProvider,
    registerCaptureUsage: async () => 'ok',
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

// ─────────────────────────────────────────── §2 PROTECTION SERVEUR (rate limit / plafond) ───────────────────────────────────────────
// Ces tests couvrent l'ORCHESTRATION (index.ts) : le mapping résultat→code, le blocage AVANT tout
// appel provider, et le fait qu'un 400 en amont ne consomme jamais le quota. La logique de SEUILS
// elle-même (5/min, 20/h, 100/mois, fenêtres glissantes, verrou concurrent) vit dans la fonction SQL
// `register_capture_usage` (voir schema.sql) — non testable ici sans instance Postgres réelle.

function spyProviders() {
  let sttCalls = 0;
  let llmCalls = 0;
  const stt: SttProvider = { name: 'spy-stt', transcribe: async () => { sttCalls++; return 'x'; } };
  const llm: LlmProvider = { name: 'spy-llm', extract: async () => { llmCalls++; return { pensees: [] }; } };
  return { stt, llm, calls: () => ({ sttCalls, llmCalls }) };
}

Deno.test('429 CAPTURE_RATE_LIMIT_MINUTE quand registerCaptureUsage renvoie "rate_limit_minute" — AUCUN appel provider', async () => {
  const spy = spyProviders();
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ getSttProvider: () => spy.stt, getLlmProvider: () => spy.llm, registerCaptureUsage: async () => 'rate_limit_minute' }),
  );
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.error, 'capture_blocked');
  assertEquals(body.code, 'CAPTURE_RATE_LIMIT_MINUTE');
  assertEquals(spy.calls(), { sttCalls: 0, llmCalls: 0 });
});

Deno.test('429 CAPTURE_RATE_LIMIT_HOUR quand registerCaptureUsage renvoie "rate_limit_hour" — AUCUN appel provider', async () => {
  const spy = spyProviders();
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ getSttProvider: () => spy.stt, getLlmProvider: () => spy.llm, registerCaptureUsage: async () => 'rate_limit_hour' }),
  );
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.code, 'CAPTURE_RATE_LIMIT_HOUR');
  assertEquals(spy.calls(), { sttCalls: 0, llmCalls: 0 });
});

Deno.test('429 CAPTURE_MONTHLY_CAP quand registerCaptureUsage renvoie "monthly_cap" — AUCUN appel provider, aucun seuil exposé', async () => {
  const spy = spyProviders();
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ getSttProvider: () => spy.stt, getLlmProvider: () => spy.llm, registerCaptureUsage: async () => 'monthly_cap' }),
  );
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.code, 'CAPTURE_MONTHLY_CAP');
  assertEquals(spy.calls(), { sttCalls: 0, llmCalls: 0 });
  const raw = JSON.stringify(body);
  assertEquals(raw.includes('100'), false, 'le seuil mensuel ne doit jamais apparaître dans la réponse');
  assertEquals(raw.toLowerCase().includes('quota'), false, 'le mot "quota" ne doit jamais apparaître dans la réponse');
});

Deno.test('200 quand registerCaptureUsage renvoie "ok" — le pipeline provider est bien appelé', async () => {
  const spy = spyProviders();
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ getSttProvider: () => spy.stt, getLlmProvider: () => spy.llm }),
  );
  assertEquals(res.status, 200);
  assertEquals(spy.calls(), { sttCalls: 0, llmCalls: 1 }); // mode transcript JSON : pas de STT, LLM appelé une fois
});

Deno.test('registerCaptureUsage reçoit bien le userId de la session vérifiée (pas un id client)', async () => {
  let receivedUserId: string | null = null;
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({
      verifySession: async () => ({ userId: 'user-precis-42' }),
      registerCaptureUsage: async (userId) => {
        receivedUserId = userId;
        return 'ok';
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(receivedUserId, 'user-precis-42');
});

Deno.test('un 400 en amont (contexte invalide) ne consomme jamais le quota — registerCaptureUsage jamais appelé', async () => {
  let called = false;
  const res = await handleRequest(
    jsonRequest({ transcript: 'x' }), // context manquant → 400 avant toute résolution provider
    depsWith({ registerCaptureUsage: async () => { called = true; return 'ok'; } }),
  );
  assertEquals(res.status, 400);
  assertEquals(called, false);
});

Deno.test('un 401 (session invalide) ne consomme jamais le quota — registerCaptureUsage jamais appelé', async () => {
  let called = false;
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ verifySession: async () => null, registerCaptureUsage: async () => { called = true; return 'ok'; } }),
  );
  assertEquals(res.status, 401);
  assertEquals(called, false);
});

Deno.test('concurrence : N appels simultanés du MÊME utilisateur ne dépassent jamais la limite (simulation d’un compteur atomique)', async () => {
  // Le VERROU réel (pg_advisory_xact_lock, voir schema.sql) ne peut pas être exercé ici sans une
  // vraie instance Postgres. Ce test simule néanmoins la garantie attendue — "compter puis insérer"
  // sérialisé par utilisateur — via un mutex JS (chaîne de promesses), pour vérifier que handleRequest
  // respecte fidèlement CE QUE registerCaptureUsage renvoie sous forte concurrence, sans jamais
  // appeler le provider pour une requête bloquée. Une implémentation naïve NON sérialisée (lire le
  // compte, puis insérer, sans verrou) laisserait passer plus de 5 requêtes ici ; ce test échouerait
  // alors qu'il ne détecterait rien côté handleRequest — c'est la fonction SQL réelle qui porte la
  // garantie d'atomicité, ce test protège seulement l'orchestration qui la consomme.
  let mutex: Promise<unknown> = Promise.resolve();
  const events: number[] = [];
  const LIMIT = 5;
  const atomicRegisterCaptureUsage = (): Promise<CaptureUsageResult> => {
    const result = mutex.then(async () => {
      // Micro-délai pour laisser une chance à une implémentation NON sérialisée de se chevaucher.
      await new Promise((r) => setTimeout(r, 1));
      if (events.length >= LIMIT) return 'rate_limit_minute' as const;
      events.push(Date.now());
      return 'ok' as const;
    });
    mutex = result;
    return result;
  };

  const spy = spyProviders();
  const N = 8;
  const results = await Promise.all(
    Array.from({ length: N }, () =>
      handleRequest(
        jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
        depsWith({ getSttProvider: () => spy.stt, getLlmProvider: () => spy.llm, registerCaptureUsage: atomicRegisterCaptureUsage }),
      ),
    ),
  );
  const statuses = results.map((r) => r.status).sort((a, b) => a - b);
  const okCount = statuses.filter((s) => s === 200).length;
  const blockedCount = statuses.filter((s) => s === 429).length;
  assertEquals(okCount, LIMIT, `attendu exactement ${LIMIT} succès sur ${N} appels concurrents, obtenu ${okCount}`);
  assertEquals(blockedCount, N - LIMIT);
  assertEquals(spy.calls().llmCalls, LIMIT, 'le provider ne doit être appelé que pour les requêtes effectivement autorisées');
});

Deno.test('isolation entre deux utilisateurs : le quota de l’un n’affecte jamais l’autre', async () => {
  const usageByUser = new Map<string, number>();
  const perUserRegister = async (userId: string): Promise<CaptureUsageResult> => {
    const count = usageByUser.get(userId) ?? 0;
    if (count >= 5) return 'rate_limit_minute';
    usageByUser.set(userId, count + 1);
    return 'ok';
  };

  // user-a épuise sa limite de 5/minute...
  for (let i = 0; i < 5; i++) {
    const res = await handleRequest(
      jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
      depsWith({ verifySession: async () => ({ userId: 'user-a' }), registerCaptureUsage: perUserRegister }),
    );
    assertEquals(res.status, 200);
  }
  const blockedA = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ verifySession: async () => ({ userId: 'user-a' }), registerCaptureUsage: perUserRegister }),
  );
  assertEquals(blockedA.status, 429);

  // ...mais user-b, jamais vu avant, n'est absolument pas affecté par l'épuisement de user-a.
  const okB = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ verifySession: async () => ({ userId: 'user-b' }), registerCaptureUsage: perUserRegister }),
  );
  assertEquals(okB.status, 200);
});

Deno.test('reset/changement de mois : un compteur mensuel épuisé pour un mois ne bloque jamais le mois suivant', async () => {
  // Simule fidèlement `date_trunc('month', created_at) = date_trunc('month', now())` : le compte est
  // conservé PAR MOIS CIVIL, jamais glissant sur 30 jours — un compteur plein en septembre ne doit
  // rien devoir au mois d'octobre qui vient de commencer.
  const monthlyCountByMonth = new Map<string, number>();
  let currentMonth = '2026-09';
  const perMonthRegister = async (): Promise<CaptureUsageResult> => {
    const count = monthlyCountByMonth.get(currentMonth) ?? 0;
    if (count >= 100) return 'monthly_cap';
    monthlyCountByMonth.set(currentMonth, count + 1);
    return 'ok';
  };

  monthlyCountByMonth.set('2026-09', 100); // septembre déjà au plafond
  const blockedSeptember = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ registerCaptureUsage: perMonthRegister }),
  );
  assertEquals(blockedSeptember.status, 429);

  currentMonth = '2026-10'; // changement de mois civil
  const okOctober = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({ registerCaptureUsage: perMonthRegister }),
  );
  assertEquals(okOctober.status, 200);
});

Deno.test('500 server_error si registerCaptureUsage lève (ex. Postgres indisponible) — AUCUN appel provider', async () => {
  const spy = spyProviders();
  const res = await handleRequest(
    jsonRequest({ transcript: 'x', context: VALID_CONTEXT }),
    depsWith({
      getSttProvider: () => spy.stt,
      getLlmProvider: () => spy.llm,
      registerCaptureUsage: async () => { throw new Error('DB indisponible'); },
    }),
  );
  assertEquals(res.status, 500);
  assertEquals(spy.calls(), { sttCalls: 0, llmCalls: 0 });
});
