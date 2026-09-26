// Tests Deno — Edge Function `delete-account` : orchestration HTTP complète sans jamais toucher au
// réseau réel ni à un vrai projet Supabase (`DeleteAccountDeps` entièrement injectée).
// Usage : deno test supabase/functions/delete-account/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { DeleteAccountDeps, handleRequest } from './index.ts';

function post(headers: Record<string, string> = { Authorization: 'Bearer test-token' }, body?: unknown): Request {
  return new Request('http://localhost/delete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function depsWith(log: string[], overrides: Partial<DeleteAccountDeps> = {}): DeleteAccountDeps {
  return {
    verifySession: async () => ({ userId: 'user-from-jwt' }),
    deleteAuthUser: async (id) => {
      log.push(`auth:${id}`);
    },
    ...overrides,
  };
}

Deno.test('405 si la méthode n’est pas POST — rien n’est supprimé', async () => {
  const log: string[] = [];
  const res = await handleRequest(new Request('http://localhost/delete-account', { method: 'GET' }), depsWith(log));
  assertEquals(res.status, 405);
  assertEquals(log, []);
});

Deno.test('401 sans session valide — rien n’est supprimé', async () => {
  const log: string[] = [];
  const res = await handleRequest(post({}), depsWith(log, { verifySession: async () => null }));
  assertEquals(res.status, 401);
  assertEquals(log, []);
});

Deno.test('200 { ok: true } : auth.admin.deleteUser est l’UNIQUE opération destructrice, pour l’utilisateur du JWT', async () => {
  const log: string[] = [];
  const res = await handleRequest(post(), depsWith(log));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(log, ['auth:user-from-jwt']);
});

Deno.test('un user_id fourni dans le corps est IGNORÉ (jamais confiance au client)', async () => {
  const log: string[] = [];
  const res = await handleRequest(post(undefined, { user_id: 'someone-else', userId: 'someone-else' }), depsWith(log));
  assertEquals(res.status, 200);
  assertEquals(log, ['auth:user-from-jwt']);
});

Deno.test('500 { error: "delete_failed" } si deleteUser échoue — jamais de faux succès, aucun contenu utilisateur', async () => {
  const res = await handleRequest(
    post(),
    depsWith([], {
      deleteAuthUser: async () => {
        throw new Error('boom contenant un e-mail secret@example.com');
      },
    }),
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body, { error: 'delete_failed' });
  assertEquals(JSON.stringify(body).includes('secret@example.com'), false);
});

Deno.test('aucun DELETE manuel préalable des tables : le code n’en contient plus (source)', async () => {
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const code = source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  assertEquals(/\.from\(/.test(code), false);
  assertEquals(/\.delete\(\)/.test(code), false);
  assertEquals(/admin\.auth\.admin\.deleteUser|auth\.admin\.deleteUser/.test(code), true);
});
