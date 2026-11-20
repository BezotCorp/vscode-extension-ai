import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  userValues: {} as Record<string, unknown>,
  updates: [] as { key: string; value: unknown; target: unknown }[],
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1 },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => (key in host.values ? host.values[key] : fallback),
      inspect: (key: string) => ({ globalValue: host.userValues[key] }),
      update: async (key: string, value: unknown, target: unknown) => {
        host.updates.push({ key, value, target });
      },
    }),
  },
}));

import {
  getExtensionConfig,
  updateExtensionModel,
  updateExtensionProvider,
  updateExtensionProviderSettings,
  updateExtensionProviderUrl,
} from '../extension_config';

describe('getExtensionConfig', () => {
  beforeEach(() => {
    host.values = {};
    host.userValues = {};
    host.updates = [];
  });

  it('uses the defaults when nothing is set', () => {
    expect(getExtensionConfig()).toEqual({
      provider: 'ollama',
      providerUrl: 'http://127.0.0.1:11434',
      model: 'qwen2.5-coder:7b',
      autonomyMode: 'confirm',
      contextTokens: 16_384,
      mcpServers: {},
    });
  });

  it('reads the provider settings, and takes the trailing slash and spaces off the URL', () => {
    host.values = { provider: 'customBackend', providerUrl: '  http://host:1234/ ', model: 'other' };

    expect(getExtensionConfig()).toMatchObject({
      provider: 'customBackend',
      providerUrl: 'http://host:1234',
      model: 'other',
    });
  });

  it('does not let the window ask for less than the smallest context', () => {
    host.values = { contextTokens: 100 };
    expect(getExtensionConfig().contextTokens).toBe(2_048);

    host.values = { contextTokens: 32_768 };
    expect(getExtensionConfig().contextTokens).toBe(32_768);
  });

  it('reads the autonomy mode and the MCP servers from the user settings only', () => {
    // A workspace value is visible through get(), but must never be used for what raises autonomy or starts programs.
    host.values = { autonomyMode: 'auto', mcpServers: { evil: { command: 'rm' } } };

    expect(getExtensionConfig()).toMatchObject({ autonomyMode: 'confirm', mcpServers: {} });

    host.userValues = { autonomyMode: 'acceptEdits', mcpServers: { files: { command: 'node' } } };

    expect(getExtensionConfig()).toMatchObject({
      autonomyMode: 'acceptEdits',
      mcpServers: { files: { command: 'node' } },
    });
  });
});

describe('the update functions', () => {
  beforeEach(() => {
    host.updates = [];
  });

  it('writes the model to the user settings, trimmed, and ignores an empty one', async () => {
    await updateExtensionModel('  llama3 ');
    await updateExtensionModel('   ');

    expect(host.updates).toEqual([{ key: 'model', value: 'llama3', target: 1 }]);
  });

  it('writes the provider and the cleaned URL, and ignores an empty URL', async () => {
    await updateExtensionProvider('ollama');
    await updateExtensionProviderUrl(' http://h:1/ ');
    await updateExtensionProviderUrl('  ');

    expect(host.updates).toEqual([
      { key: 'provider', value: 'ollama', target: 1 },
      { key: 'providerUrl', value: 'http://h:1', target: 1 },
    ]);
  });

  it('writes both at once', async () => {
    await updateExtensionProviderSettings('customBackend', 'http://b/');

    expect(host.updates.map((update) => update.key)).toEqual(['provider', 'providerUrl']);
  });
});
