import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getSttProvider, UnknownSttProviderError } from './index.ts';

Deno.test('getSttProvider("mock") renvoie le provider mock', () => {
  const provider = getSttProvider('mock');
  assertEquals(provider.name, 'mock');
});

Deno.test('getSttProvider("openai") renvoie le provider openai', () => {
  const provider = getSttProvider('openai');
  assertEquals(provider.name, 'openai');
});

Deno.test('getSttProvider("groq") renvoie le provider groq', () => {
  const provider = getSttProvider('groq');
  assertEquals(provider.name, 'groq');
});

Deno.test('getSttProvider(nom inconnu) lève UnknownSttProviderError', () => {
  assertThrows(() => getSttProvider('deepgram'), UnknownSttProviderError);
});
