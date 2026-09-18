// Tests Deno — adaptateur STT Groq. Même précaution que openai.test.ts (nom de fichier avec
// extension) — `fetch` est intercepté, aucun réseau réel, aucune clé requise.
import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { groqSttProvider } from './groq.ts';

function withFakeFetch<T>(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test('groqSttProvider envoie un nom de fichier AVEC extension même si le nom d’origine n’en a pas', async () => {
  const previousKey = Deno.env.get('GROQ_API_KEY');
  Deno.env.set('GROQ_API_KEY', 'test-key');
  let capturedFilename: string | null = null;
  let capturedUrl: string | URL | Request | null = null;

  await withFakeFetch(
    async (input, init) => {
      capturedUrl = input;
      const form = init!.body as FormData;
      const file = form.get('file') as File;
      capturedFilename = file.name;
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    },
    async () => {
      await groqSttProvider.transcribe(
        { bytes: new TextEncoder().encode('x'), mimeType: 'audio/wav', filename: 'audio' },
        { model: 'whisper-large-v3' },
      );
    },
  );

  if (previousKey === undefined) Deno.env.delete('GROQ_API_KEY');
  else Deno.env.set('GROQ_API_KEY', previousKey);

  assertMatch(capturedFilename!, /\.wav$/);
  assertEquals(String(capturedUrl), 'https://api.groq.com/openai/v1/audio/transcriptions');
});

Deno.test('groqSttProvider préserve un nom de fichier qui a déjà une extension valide', async () => {
  const previousKey = Deno.env.get('GROQ_API_KEY');
  Deno.env.set('GROQ_API_KEY', 'test-key');
  let capturedFilename: string | null = null;

  await withFakeFetch(
    async (_input, init) => {
      const form = init!.body as FormData;
      const file = form.get('file') as File;
      capturedFilename = file.name;
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    },
    async () => {
      await groqSttProvider.transcribe(
        { bytes: new TextEncoder().encode('x'), mimeType: 'audio/wav', filename: '1.wav' },
        { model: 'whisper-large-v3' },
      );
    },
  );

  if (previousKey === undefined) Deno.env.delete('GROQ_API_KEY');
  else Deno.env.set('GROQ_API_KEY', previousKey);

  assertEquals(capturedFilename, '1.wav');
});

Deno.test('groqSttProvider transmet le modèle demandé (jamais hardcodé)', async () => {
  const previousKey = Deno.env.get('GROQ_API_KEY');
  Deno.env.set('GROQ_API_KEY', 'test-key');
  let capturedModel: string | null = null;

  await withFakeFetch(
    async (_input, init) => {
      const form = init!.body as FormData;
      capturedModel = form.get('model') as string;
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    },
    async () => {
      await groqSttProvider.transcribe(
        { bytes: new TextEncoder().encode('x'), mimeType: 'audio/wav', filename: '1.wav' },
        { model: 'un-modele-au-choix' },
      );
    },
  );

  if (previousKey === undefined) Deno.env.delete('GROQ_API_KEY');
  else Deno.env.set('GROQ_API_KEY', previousKey);

  assertEquals(capturedModel, 'un-modele-au-choix');
});

Deno.test('groqSttProvider — CHANTIER Pensif/Pansif (2026-09-18) : envoie un hint "prompt" minimal = "Pensif", rien d’autre', async () => {
  const previousKey = Deno.env.get('GROQ_API_KEY');
  Deno.env.set('GROQ_API_KEY', 'test-key');
  let capturedPrompt: string | null = null;

  await withFakeFetch(
    async (_input, init) => {
      const form = init!.body as FormData;
      capturedPrompt = form.get('prompt') as string;
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    },
    async () => {
      await groqSttProvider.transcribe({ bytes: new TextEncoder().encode('x'), mimeType: 'audio/wav', filename: '1.wav' }, { model: 'whisper-large-v3' });
    },
  );

  if (previousKey === undefined) Deno.env.delete('GROQ_API_KEY');
  else Deno.env.set('GROQ_API_KEY', previousKey);

  assertEquals(capturedPrompt, 'Pensif');
});

Deno.test('groqSttProvider lève une erreur explicite si GROQ_API_KEY est absent', async () => {
  const previousKey = Deno.env.get('GROQ_API_KEY');
  Deno.env.delete('GROQ_API_KEY');
  try {
    let threw = false;
    try {
      await groqSttProvider.transcribe({ bytes: new TextEncoder().encode('x'), mimeType: 'audio/wav', filename: '1.wav' }, { model: 'x' });
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  } finally {
    if (previousKey !== undefined) Deno.env.set('GROQ_API_KEY', previousKey);
  }
});
