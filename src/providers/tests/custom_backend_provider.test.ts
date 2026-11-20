import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import type { ExtensionConfig } from '../../config/extension_config';
import type { ChatStreamHandler } from '../chat_stream_handler';
import { CustomBackendProvider } from '../custom_backend_provider';

const config: ExtensionConfig = {
  provider: 'customBackend',
  providerUrl: 'http://backend.test',
  model: 'm',
  autonomyMode: 'confirm',
  contextTokens: 8_192,
  mcpServers: {},
};
const request = { message: 'hello', context: { editor: {} } };
const fetchMock = vi.fn();

describe('CustomBackendProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not offer tools', () => {
    expect(new CustomBackendProvider(config).supportsTools).toBe(false);
  });

  it('is connected when /health answers, disconnected otherwise', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok'));
    expect(await new CustomBackendProvider(config).health()).toEqual({
      status: 'connected',
      providerUrl: 'http://backend.test',
      text: 'status.connected',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://backend.test/health');

    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect((await new CustomBackendProvider(config).health()).text).toContain('HTTP 503');

    fetchMock.mockRejectedValueOnce(new Error('refused'));
    expect((await new CustomBackendProvider(config).health()).status).toBe('disconnected');
  });

  it('sends the request as JSON to /chat and returns the content', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ content: 'hi' })));

    expect(await new CustomBackendProvider(config).chat(request)).toEqual({ text: 'hi' });

    const [url, options] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe('http://backend.test/chat');
    expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(options.body)).toEqual(request);
  });

  it('returns the error of the backend, or says there was no response', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'broken' })))
      .mockResolvedValueOnce(new Response('{}'));

    const provider = new CustomBackendProvider(config);

    expect((await provider.chat(request)).text).toBe('broken');
    expect((await provider.chat(request)).text).toBe('no response');
  });

  it('fails with the status and the start of the message when the backend refuses', async () => {
    fetchMock.mockResolvedValueOnce(new Response('d'.repeat(400), { status: 500 }));

    await expect(new CustomBackendProvider(config).chat(request)).rejects.toThrow(`HTTP 500: ${'d'.repeat(300)}`);

    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }));

    await expect(new CustomBackendProvider(config).chat(request)).rejects.toThrow('HTTP 502');
  });

  it('streams the whole answer as one chunk, with the signal it was given', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ content: 'whole answer' })));

    const events: string[] = [];
    const handler: ChatStreamHandler = {
      onStart: () => events.push('start'),
      onChunk: (chunk) => events.push(chunk),
      onEnd: () => events.push('end'),
    };
    const controller = new AbortController();

    await new CustomBackendProvider(config).streamChat(request, handler, controller.signal);

    expect(events).toEqual(['start', 'whole answer', 'end']);
    expect(fetchMock.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });
});
