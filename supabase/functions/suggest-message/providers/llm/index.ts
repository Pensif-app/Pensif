import { LlmProvider } from './types.ts';
import { mockLlmProvider } from './mock.ts';
import { openaiLlmProvider } from './openai.ts';

export class UnknownLlmProviderError extends Error {}

export function getLlmProvider(providerName: string): LlmProvider {
  switch (providerName) {
    case 'mock':
      return mockLlmProvider;
    case 'openai':
      return openaiLlmProvider;
    default:
      throw new UnknownLlmProviderError(`LLM_PROVIDER inconnu : "${providerName}"`);
  }
}
