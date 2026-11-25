import type { TranslationProvider, ProviderConfig } from './types';
import { createMockProvider } from './adapters/mock';
import { createVolcProvider } from './adapters/volc';
import { createOpenAIProvider } from './adapters/openai';

export function createProvider(id: string, config: ProviderConfig = {}): TranslationProvider {
  switch (id) {
    case 'volc':
      return createVolcProvider(config);
    case 'openai':
      return createOpenAIProvider(config);
    case 'mock':
      return createMockProvider();
    default:
      throw new Error(`Unknown provider: ${id}`);
  }
}

export const SUPPORTED_PROVIDERS = ['volc', 'baidu', 'openai', 'mock'] as const;
