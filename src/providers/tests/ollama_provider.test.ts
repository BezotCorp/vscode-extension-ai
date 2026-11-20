import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import type { ExtensionConfig } from '../../config/extension_config';
import type { Tool } from '../../tools/tool';
import { ToolRegistry } from '../../tools/tool_registry';
import { toolSuccess } from '../../tools/tool_result';
import type { ChatRequest } from '../chat_request';
import type { ChatStreamHandler } from '../chat_stream_handler';
import { CAPABILITY_GUIDE, NO_TOOLS_GUIDE } from '../ollama_prompt_guides';
import { OllamaProvider } from '../ollama_provider';

const fetchMock = vi.fn();
let counter = 0;

// Each test gets its own model, since what the provider learns about a model is shared by every instance.
function makeConfig(overrides: Partial<ExtensionConfig> = {}): ExtensionConfig {
  counter++;

  return {
    provider: 'ollama',
    providerUrl: `http://ollama.test:${11_000 + counter}`,
    model: `model-${counter}`,
    autonomyMode: 'confirm',
    contextTokens: 8_192,
    mcpServers: {},
    ...overrides,
  };
}

const request = (overrides: Partial<ChatRequest> = {}): ChatRequest => ({
  message: 'hello',
  context: { editor: {} },
  ...overrides,
});

function ndjson(...lines: object[]): Response {
  return new Response(lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
}

function streamOf(...parts: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(encoder.encode(part));
        }

        controller.close();
      },
    }),
  );
}

function recorder() {
  const events: string[] = [];
  const handler: ChatStreamHandler = {
    onStart: () => events.push('start'),
    onChunk: (chunk) => events.push(`chunk:${chunk}`),
    onToolCall: (call) => events.push(`call:${call.name}`),
    onToolResult: (call, result) => events.push(`result:${call.name}:${result.status}`),
    onToolRound: (round) => events.push(`round:${round.calls.length}`),
    onNotice: (text) => events.push(`notice:${text.trim()}`),
    onEnd: () => events.push('end'),
  };

  return { events, handler };
}

const body = (call: number) => JSON.parse(fetchMock.mock.calls[call]?.[1].body as string);
const readTool: Tool = {
  id: 'read_file',
  name: 'Read File',
  description: 'reads',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  readOnlyCompatible: true,
  permissionDefault: 'allow',
  execute: async (input) => toolSuccess('read_file', (input as { path: string }).path, { content: 'file text' }),
};

function registry(): ToolRegistry {
  const tools = new ToolRegistry();

  tools.register(readTool);

  return tools;
}

describe('OllamaProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks the tool calling protocol', () => {
    expect(new OllamaProvider(makeConfig()).supportsTools).toBe(true);
  });

  describe('health', () => {
    it('is connected when the server answers', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}'));

      const config = makeConfig();
      const status = await new OllamaProvider(config).health();

      expect(status).toEqual({ status: 'connected', providerUrl: config.providerUrl, text: 'status.connectedOllama' });
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${config.providerUrl}/api/tags`);
    });

    it('is disconnected when the server answers with an error, or does not answer', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
      expect((await new OllamaProvider(makeConfig()).health()).text).toContain('HTTP 500');

      fetchMock.mockRejectedValueOnce(new Error('connection refused'));

      const status = await new OllamaProvider(makeConfig()).health();

      expect(status.status).toBe('disconnected');
      expect(status.text).toContain('connection refused');
    });
  });

  describe('resolveContextTokens', () => {
    const info = (model_info: Record<string, unknown>) =>
      new Response(JSON.stringify({ model_info }), { headers: { 'content-type': 'application/json' } });

    it('lowers the requested window to what the model supports', async () => {
      fetchMock.mockResolvedValueOnce(info({ 'llama.context_length': 4_096 }));

      expect(await new OllamaProvider(makeConfig()).resolveContextTokens()).toBe(4_096);
    });

    it('keeps the requested window when the model supports more', async () => {
      fetchMock.mockResolvedValueOnce(info({ 'llama.context_length': 131_072 }));

      expect(await new OllamaProvider(makeConfig()).resolveContextTokens()).toBe(8_192);
    });

    it('keeps the requested window when the server does not say, in every way it may fail', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
      expect(await new OllamaProvider(makeConfig()).resolveContextTokens()).toBe(8_192);

      fetchMock.mockResolvedValueOnce(info({ 'other.key': 1 }));
      expect(await new OllamaProvider(makeConfig()).resolveContextTokens()).toBe(8_192);

      fetchMock.mockResolvedValueOnce(info({ 'llama.context_length': 'big' }));
      expect(await new OllamaProvider(makeConfig()).resolveContextTokens()).toBe(8_192);

      fetchMock.mockResolvedValueOnce(info({ 'llama.context_length': 0 }));
      expect(await new OllamaProvider(makeConfig()).resolveContextTokens()).toBe(8_192);

      fetchMock.mockRejectedValueOnce(new Error('down'));
      expect(await new OllamaProvider(makeConfig()).resolveContextTokens()).toBe(8_192);
    });

    it('asks the server once per model', async () => {
      fetchMock.mockResolvedValue(info({ 'llama.context_length': 4_096 }));

      const config = makeConfig();

      await new OllamaProvider(config).resolveContextTokens();
      await new OllamaProvider(config).resolveContextTokens();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(body(0)).toEqual({ model: config.model });
    });
  });

  describe('chat', () => {
    it('sends the conversation without tools and returns the answer', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: 'the answer' } })));

      const result = await new OllamaProvider(makeConfig()).chat(request());

      expect(result).toEqual({ text: 'the answer' });
      expect(body(1)).toMatchObject({ stream: false, options: { num_ctx: 8_192 } });
      expect(body(1).tools).toBeUndefined();
      expect(body(1).messages.at(-1)).toEqual({ role: 'user', content: 'hello' });
    });

    it('returns the error the server reported, or says there was no response', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'model not found' })))
        .mockResolvedValueOnce(new Response('{}'));

      const provider = new OllamaProvider(makeConfig());

      expect((await provider.chat(request())).text).toBe('model not found');
      expect((await provider.chat(request())).text).toBe('no response');
    });
  });

  describe('streamChat without tools', () => {
    beforeEach(() => fetchMock.mockResolvedValueOnce(new Response('', { status: 404 })));

    it('streams the chunks in order between start and end', async () => {
      fetchMock.mockResolvedValueOnce(
        ndjson({ message: { content: 'Hel' } }, { message: { content: 'lo' } }, { done: true }),
      );

      const { events, handler } = recorder();

      await new OllamaProvider(makeConfig()).streamChat(request(), handler);

      expect(events).toEqual(['start', 'chunk:Hel', 'chunk:lo', 'end']);
      expect(body(1)).toMatchObject({ stream: true, options: { num_ctx: 8_192 } });
      expect(body(1).tools).toBeUndefined();
    });

    it('puts the guide, the active file and the earlier turns in the messages, and the question last', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ done: true }));

      await new OllamaProvider(makeConfig()).streamChat(
        request({
          context: { editor: { activeFile: { path: '/w/a.ts', languageId: 'typescript', content: 'const a = 1;' } } },
          history: [
            { role: 'user', content: 'earlier question' },
            {
              role: 'assistant',
              content: 'earlier answer',
              toolRounds: [{ content: '', calls: [{ name: 'read_file', arguments: {}, result: '{}' }] }],
            },
          ],
        }),
        recorder().handler,
      );

      const messages = body(1).messages;

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain(NO_TOOLS_GUIDE);
      expect(messages[0].content).toContain('Active file: /w/a.ts');
      expect(messages[0].content).toContain('const a = 1;');
      // Without tools in this request, the earlier tool traffic is left out: only what was said remains.
      expect(messages.slice(1)).toEqual([
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
        { role: 'user', content: 'hello' },
      ]);
    });

    it('withholds a protected file and tells the model how to ask for it', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ done: true }));

      await new OllamaProvider(makeConfig()).streamChat(
        request({
          context: { editor: { activeFile: { path: '/w/.env', languageId: 'dotenv', withheld: 'protected' } } },
        }),
        recorder().handler,
      );

      expect(body(1).messages[0].content).toContain('Content withheld: this is a protected resource.');
      expect(body(1).messages[0].content).not.toContain('```');
    });

    it('leaves the editor out when the filter does not include it', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ done: true }));

      await new OllamaProvider(makeConfig()).streamChat(
        request({
          contextFilter: [],
          context: { editor: { activeFile: { path: '/w/a.ts', languageId: 'ts', content: 'secret' } } },
        }),
        recorder().handler,
      );

      expect(body(1).messages[0].content).not.toContain('secret');
    });

    it('cuts the active file to fit the share of the window the context may take', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ done: true }));

      const content = 'x'.repeat(50_000);

      await new OllamaProvider(makeConfig({ contextTokens: 2_048 })).streamChat(
        request({ context: { editor: { activeFile: { path: '/w/a.ts', languageId: 'ts', content } } } }),
        recorder().handler,
      );

      const system = body(1).messages[0].content as string;

      expect(system).toContain('/* cut to fit the model context */');
      expect(system.length).toBeLessThan(content.length);
    });

    it('reassembles lines that arrive split across chunks, and ignores blank lines', async () => {
      const line = JSON.stringify({ message: { content: 'whole' } });

      fetchMock.mockResolvedValueOnce(streamOf(line.slice(0, 10), `${line.slice(10)}\n\n`, '{"done":true}\n'));

      const { events, handler } = recorder();

      await new OllamaProvider(makeConfig()).streamChat(request(), handler);

      expect(events).toEqual(['start', 'chunk:whole', 'end']);
    });

    it('ends when the stream ends without a done line', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ message: { content: 'partial' } }));

      const { events, handler } = recorder();

      await new OllamaProvider(makeConfig()).streamChat(request(), handler);

      expect(events).toEqual(['start', 'chunk:partial', 'end']);
    });

    it('fails with the error the model reported in the stream', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ error: 'out of memory' }));

      await expect(new OllamaProvider(makeConfig()).streamChat(request(), recorder().handler)).rejects.toThrow(
        'out of memory',
      );
    });

    it('fails with the HTTP status and the start of the message', async () => {
      fetchMock.mockResolvedValueOnce(new Response('x'.repeat(400), { status: 500 }));

      await expect(new OllamaProvider(makeConfig()).streamChat(request(), recorder().handler)).rejects.toThrow(
        `HTTP 500: ${'x'.repeat(300)}`,
      );
    });

    it('fails when the response has no body', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null));

      await expect(new OllamaProvider(makeConfig()).streamChat(request(), recorder().handler)).rejects.toThrow(
        'Streaming response body is empty',
      );
    });

    it('stops when the request is cancelled while streaming', async () => {
      const controller = new AbortController();

      fetchMock.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new TextEncoder().encode(`${JSON.stringify({ message: { content: 'a' } })}\n`));
              controller.abort();
              stream.enqueue(new TextEncoder().encode(`${JSON.stringify({ message: { content: 'b' } })}\n`));
              stream.close();
            },
          }),
        ),
      );

      const { events, handler } = recorder();

      await expect(new OllamaProvider(makeConfig()).streamChat(request(), handler, controller.signal)).rejects.toThrow(
        'Generation aborted',
      );
      expect(events).not.toContain('end');
    });
  });

  describe('streamChat with tools', () => {
    beforeEach(() => fetchMock.mockResolvedValueOnce(new Response('', { status: 404 })));

    it('offers the tools and the capability guide, including the tools that are not available', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ message: { content: 'ok' } }, { done: true }));

      const tools = registry();

      tools.markUnavailable({ ...readTool, id: 'update_file', name: 'Update File' }, 'read-only');

      await new OllamaProvider(makeConfig()).streamChat(request({ tools }), recorder().handler);

      expect(body(1).tools).toEqual([
        { type: 'function', function: { name: 'read_file', description: 'reads', parameters: readTool.parameters } },
      ]);
      expect(body(1).messages[0].content).toContain(CAPABILITY_GUIDE);
      expect(body(1).messages[0].content).toContain('Not available right now: update_file (read-only).');
    });

    it('runs the tools the model asks for and sends their results back, until it answers', async () => {
      fetchMock
        .mockResolvedValueOnce(
          ndjson(
            { message: { content: 'Let me look. ' } },
            { message: { tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a.ts' } } }] } },
            { done: true },
          ),
        )
        .mockResolvedValueOnce(ndjson({ message: { content: 'It says: file text' } }, { done: true }));

      const { events, handler } = recorder();

      await new OllamaProvider(makeConfig()).streamChat(request({ tools: registry() }), handler);

      expect(events).toEqual([
        'start',
        'chunk:Let me look. ',
        'call:read_file',
        'result:read_file:success',
        'round:1',
        'chunk:It says: file text',
        'end',
      ]);

      const second = body(2).messages;

      expect(second.at(-2)).toEqual({
        role: 'assistant',
        content: 'Let me look. ',
        tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a.ts' } } }],
      });
      expect(second.at(-1)).toMatchObject({ role: 'tool', tool_name: 'read_file' });
      expect(JSON.parse(second.at(-1).content)).toMatchObject({ status: 'success', content: 'file text' });
    });

    it('reads the arguments of a call that the model sent as a JSON string, and keeps one that is not JSON', async () => {
      const seen: unknown[] = [];
      const tools = new ToolRegistry();

      tools.register({
        ...readTool,
        parameters: { type: 'object', properties: {} },
        execute: async (input) => {
          seen.push(input);

          return toolSuccess('read_file', undefined);
        },
      });
      fetchMock
        .mockResolvedValueOnce(
          ndjson(
            {
              message: {
                tool_calls: [
                  { function: { name: 'read_file', arguments: '{"path":"x"}' } },
                  { function: { name: 'read_file', arguments: undefined } },
                ],
              },
            },
            { done: true },
          ),
        )
        .mockResolvedValueOnce(ndjson({ done: true }));

      await new OllamaProvider(makeConfig()).streamChat(request({ tools }), recorder().handler);

      expect(seen).toEqual([{ path: 'x' }, {}]);
    });

    it('replays earlier tool traffic to a model that gets tools, then what was said', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ done: true }));

      await new OllamaProvider(makeConfig()).streamChat(
        request({
          tools: registry(),
          history: [
            {
              role: 'assistant',
              content: 'closing answer',
              toolRounds: [
                {
                  content: 'working',
                  calls: [{ name: 'read_file', arguments: { path: 'a' }, result: '{"status":"success"}' }],
                },
              ],
            },
            { role: 'assistant', content: '   ', toolRounds: [{ content: '', calls: [] }] },
          ],
        }),
        recorder().handler,
      );

      expect(body(1).messages.slice(1, -1)).toEqual([
        {
          role: 'assistant',
          content: 'working',
          tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a' } } }],
        },
        { role: 'tool', tool_name: 'read_file', content: '{"status":"success"}' },
        { role: 'assistant', content: 'closing answer' },
        { role: 'assistant', content: '', tool_calls: [] },
      ]);
    });

    it('does not send the file observations the tools made to the model', async () => {
      fetchMock.mockResolvedValueOnce(ndjson({ done: true }));

      await new OllamaProvider(makeConfig()).streamChat(
        request({
          tools: registry(),
          history: [
            {
              role: 'assistant',
              content: 'x',
              toolRounds: [
                {
                  content: '',
                  calls: [
                    {
                      name: 'read_file',
                      arguments: {},
                      result: 'r',
                      observations: [{ path: '/a', sha: 'a'.repeat(64), complete: true, origin: 'read' }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
        recorder().handler,
      );

      expect(JSON.stringify(body(1))).not.toContain('a'.repeat(64));
    });

    it('answers without tools once the model says it does not support them, and remembers it', async () => {
      const config = makeConfig();

      fetchMock
        .mockResolvedValueOnce(new Response('registry.ollama.ai/x does not support tools', { status: 400 }))
        .mockResolvedValueOnce(ndjson({ message: { content: 'no tools here' } }, { done: true }))
        .mockResolvedValueOnce(ndjson({ message: { content: 'again' } }, { done: true }));

      const first = recorder();

      await new OllamaProvider(config).streamChat(request({ tools: registry() }), first.handler);

      expect(first.events).toEqual([
        'start',
        `notice:chat.notice.noTools:{"model":"${config.model}"}`,
        'chunk:no tools here',
        'end',
      ]);
      expect(body(1).tools).toBeDefined();
      expect(body(2).tools).toBeUndefined();

      await new OllamaProvider(config).streamChat(request({ tools: registry() }), recorder().handler);

      expect(body(3).tools).toBeUndefined();
      expect(body(3).messages[0].content).toContain(NO_TOOLS_GUIDE);
    });

    it('does not take another error for a lack of tool support', async () => {
      fetchMock.mockResolvedValueOnce(new Response('bad request', { status: 400 }));

      await expect(
        new OllamaProvider(makeConfig()).streamChat(request({ tools: registry() }), recorder().handler),
      ).rejects.toThrow('HTTP 400: bad request');
    });
  });
});
