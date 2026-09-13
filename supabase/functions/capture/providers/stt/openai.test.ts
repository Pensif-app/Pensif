// Tests Deno — BUG CORRIGÉ "Unrecognized file format" (OpenAI Whisper détecte le format audio par
// l'extension du nom de fichier envoyé, pas seulement le Content-Type). On ne peut pas tester
// `transcribe` lui-même sans clé API réelle/réseau, mais la construction du nom de fichier envoyé
// est extraite et testée ici en important le module et en interceptant `fetch` (aucun réseau réel).
import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openaiSttProvider } from './openai.ts';

function withFakeFetch<T>(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test('openaiSttProvider envoie un nom de fichier AVEC extension même si le nom d’origine n’en a pas', async () => {
  const previousKey = Deno.env.get('OPENAI_API_KEY');
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  let capturedFilename: string | null = null;

  await withFakeFetch(
    async (_input, init) => {
      const form = init!.body as FormData;
      const file = form.get('file') as File;
      capturedFilename = file.name;
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    },
    async () => {
      await openaiSttProvider.transcribe(
        { bytes: new TextEncoder().encode('x'), mimeType: 'audio/m4a', filename: 'audio' }, // pas d'extension, cas du bug
        { model: 'whisper-1' },
      );
    },
  );

  if (previousKey === undefined) Deno.env.delete('OPENAI_API_KEY');
  else Deno.env.set('OPENAI_API_KEY', previousKey);

  assertMatch(capturedFilename!, /\.m4a$/);
});

Deno.test('openaiSttProvider préserve un nom de fichier qui a déjà une extension valide', async () => {
  const previousKey = Deno.env.get('OPENAI_API_KEY');
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  let capturedFilename: string | null = null;

  await withFakeFetch(
    async (_input, init) => {
      const form = init!.body as FormData;
      const file = form.get('file') as File;
      capturedFilename = file.name;
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    },
    async () => {
      await openaiSttProvider.transcribe(
        { bytes: new TextEncoder().encode('x'), mimeType: 'audio/m4a', filename: '1.m4a.m4a' },
        { model: 'whisper-1' },
      );
    },
  );

  if (previousKey === undefined) Deno.env.delete('OPENAI_API_KEY');
  else Deno.env.set('OPENAI_API_KEY', previousKey);

  assertEquals(capturedFilename, '1.m4a.m4a');
});
