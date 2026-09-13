import { LlmProvider } from './types.ts';
import { mockLlmProvider } from './mock.ts';
import { anthropicLlmProvider } from './anthropic.ts';

export class UnknownLlmProviderError extends Error {}

export function getLlmProvider(providerName: string): LlmProvider {
  switch (providerName) {
    case 'mock':
      return mockLlmProvider;
    case 'anthropic':
      return anthropicLlmProvider;
    default:
      throw new UnknownLlmProviderError(`LLM_PROVIDER inconnu : "${providerName}"`);
  }
}
