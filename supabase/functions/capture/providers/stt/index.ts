// Factory STT — sélection par variable d'env, jamais par une condition dans l'orchestration
// (index.ts) ni un nom de fournisseur en dur ailleurs dans le code métier.
import { SttProvider } from './types.ts';
import { mockSttProvider } from './mock.ts';
import { openaiSttProvider } from './openai.ts';
import { groqSttProvider } from './groq.ts';

export class UnknownSttProviderError extends Error {}

export function getSttProvider(providerName: string): SttProvider {
  switch (providerName) {
    case 'mock':
      return mockSttProvider;
    case 'openai':
      return openaiSttProvider;
    case 'groq':
      return groqSttProvider;
    default:
      throw new UnknownSttProviderError(`STT_PROVIDER inconnu : "${providerName}"`);
  }
}
