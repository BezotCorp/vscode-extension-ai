import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  updates: [] as { key: string; value: unknown }[],
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1 },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => (key in host.values ? host.values[key] : fallback),
      inspect: () => undefined,
      update: async (key: string, value: unknown) => {
        host.updates.push({ key, value });
        host.values[key] = value;
      },
    }),
  },
}));

import { ModelManager } from '../model_manager';
import { createModelProvider } from '../model_registry';
import { OllamaModelProvider } from '../ollama_model_provider';
import { StaticModelProvider } from '../static_model_provider';

const fetchMock = vi.fn();

describe('model providers', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the models of an Ollama server sorted by name, whichever field holds the name', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ models: [{ name: 'zeta' }, { model: 'alpha' }, {}, { name: 'mid', model: 'x' }] })),
    );

    const models = await new OllamaModelProvider('http://h:1').listModels();

    expect(models).toEqual([
      { id: 'alpha', name: 'alpha', provider: 'ollama' },
      { id: 'mid', name: 'mid', provider: 'ollama' },
      { id: 'zeta', name: 'zeta', provider: 'ollama' },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://h:1/api/tags');
  });

  it('lists nothing when the server has no models, and fails when it answers with an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    expect(await new OllamaModelProvider('http://h:1').listModels()).toEqual([]);

    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(new OllamaModelProvider('http://h:1').listModels()).rejects.toThrow('HTTP 500');
  });

  it('lists only the configured model for a provider that has no list', async () => {
    expect(await new StaticModelProvider('customBackend', 'm').listModels()).toEqual([
      { id: 'm', name: 'm', provider: 'customBackend' },
    ]);
  });

  it('chooses the provider by the configuration', () => {
    const base = {
      providerUrl: 'http://h',
      model: 'm',
      autonomyMode: 'confirm',
      contextTokens: 8_192,
      mcpServers: {},
    } as const;

    expect(createModelProvider({ ...base, provider: 'ollama' })).toBeInstanceOf(OllamaModelProvider);
    expect(createModelProvider({ ...base, provider: 'customBackend' })).toBeInstanceOf(StaticModelProvider);
    expect(createModelProvider({ ...base, provider: 'bezotcorp' })).toBeInstanceOf(StaticModelProvider);
  });
});

describe('ModelManager', () => {
  beforeEach(() => {
    host.values = { provider: 'ollama', providerUrl: 'http://h:1', model: 'active' };
    host.updates = [];
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('describes the state with the models of the server', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'active' }, { name: 'other' }] })));

    expect(await new ModelManager().getState()).toEqual({
      provider: 'ollama',
      providerUrl: 'http://h:1',
      activeModel: 'active',
      models: [
        { id: 'active', name: 'active', provider: 'ollama' },
        { id: 'other', name: 'other', provider: 'ollama' },
      ],
    });
  });

  it('adds the active model first when the server does not list it', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'other' }] })));

    const state = await new ModelManager().getState();

    expect(state.models.map((model) => model.id)).toEqual(['active', 'other']);
  });

  it('still describes the state, with the error, when the server cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    const state = await new ModelManager().getState();

    expect(state.models).toEqual([{ id: 'active', name: 'active', provider: 'ollama' }]);
    expect(state.error).toContain('connection refused');
  });

  it('changes the active model and returns the new state', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'new' }] })));

    const state = await new ModelManager().setActiveModel(' new ');

    expect(host.updates).toEqual([{ key: 'model', value: 'new' }]);
    expect(state.activeModel).toBe('new');
  });

  it('changes the provider and its URL and returns the new state', async () => {
    const state = await new ModelManager().updateProviderSettings('customBackend', 'http://b:2/');

    expect(host.updates).toEqual([
      { key: 'provider', value: 'customBackend' },
      { key: 'providerUrl', value: 'http://b:2' },
    ]);
    expect(state).toMatchObject({ provider: 'customBackend', providerUrl: 'http://b:2' });
  });
});
