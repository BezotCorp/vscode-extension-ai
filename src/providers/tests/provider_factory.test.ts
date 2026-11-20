import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import type { ExtensionConfig } from '../../config/extension_config';
import { CustomBackendProvider } from '../custom_backend_provider';
import { OllamaProvider } from '../ollama_provider';
import { createProvider } from '../provider_factory';

const config = (provider: ExtensionConfig['provider']): ExtensionConfig => ({
  provider,
  providerUrl: 'http://x.test',
  model: 'm',
  autonomyMode: 'confirm',
  contextTokens: 8_192,
  mcpServers: {},
});

describe('createProvider', () => {
  it('creates the provider the configuration names', () => {
    expect(createProvider(config('ollama'))).toBeInstanceOf(OllamaProvider);
    expect(createProvider(config('customBackend'))).toBeInstanceOf(CustomBackendProvider);
  });

  it('gives a placeholder for the hosted provider, which says it is not available', async () => {
    const provider = createProvider(config('bezotcorp'));
    const chunks: string[] = [];
    const events: string[] = [];

    expect(provider.supportsTools).toBe(false);
    expect(await provider.health()).toEqual({
      status: 'disconnected',
      providerUrl: 'http://x.test',
      text: 'status.hostedUnavailable',
    });
    expect(await provider.chat({ message: 'x', context: { editor: {} } })).toEqual({
      text: 'status.hostedUnavailableChat',
    });

    await provider.streamChat(
      { message: 'x', context: { editor: {} } },
      {
        onStart: () => events.push('start'),
        onChunk: (chunk) => chunks.push(chunk),
        onEnd: () => events.push('end'),
      },
    );

    expect(events).toEqual(['start', 'end']);
    expect(chunks).toEqual(['status.hostedUnavailableChat']);
  });
});
