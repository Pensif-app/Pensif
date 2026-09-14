import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getLlmProvider, UnknownLlmProviderError } from './index.ts';

Deno.test('getLlmProvider("mock") renvoie le provider mock', () => {
  const provider = getLlmProvider('mock');
  assertEquals(provider.name, 'mock');
});

Deno.test('getLlmProvider("anthropic") renvoie le provider anthropic', () => {
  const provider = getLlmProvider('anthropic');
  assertEquals(provider.name, 'anthropic');
});

Deno.test('getLlmProvider("openai") renvoie le provider openai', () => {
  const provider = getLlmProvider('openai');
  assertEquals(provider.name, 'openai');
});

Deno.test('getLlmProvider(nom inconnu) lève UnknownLlmProviderError', () => {
  assertThrows(() => getLlmProvider('openai-gpt'), UnknownLlmProviderError);
});
