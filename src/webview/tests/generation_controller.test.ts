import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  warnings: [] as string[],
  storeSends: 0,
  config: { provider: 'ollama', providerUrl: 'http://h:1', autonomyMode: 'confirm' as string },
  provider: undefined as unknown,
  registries: [] as unknown[],
  guardArgs: [] as unknown[][],
  unavailable: {} as Record<string, string | undefined>,
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: async (message: string) => {
      host.warnings.push(message);
    },
  },
}));
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));
vi.mock('../../config/extension_config', () => ({ getExtensionConfig: () => host.config }));
vi.mock('../../context', async (original) => ({
  ...(await original<typeof import('../../context')>()),
  buildAiContext: async () => ({ editor: { activeFile: { path: '/w/a.ts', languageId: 'ts', content: 'x' } } }),
}));
vi.mock('../../providers/provider_factory', () => ({ createProvider: () => host.provider }));
vi.mock('../chat_store_presenter', () => ({
  sendChatStore: () => {
    host.storeSends++;
  },
}));
vi.mock('../../tools', () => ({
  ToolAccessGuard: class {
    mode: string;

    constructor(...args: unknown[]) {
      host.guardArgs.push(args);
      this.mode = (args[1] as () => string)();
    }

    unavailableReason(tool: { id: string }) {
      return host.unavailable[tool.id];
    }
  },
  createDefaultToolRegistry: () => {
    const registry = {
      registered: [] as { id: string }[],
      unavailable: [] as { id: string; reason: string }[],
      register(tool: { id: string }) {
        registry.registered.push(tool);
      },
      markUnavailable(tool: { id: string }, reason: string) {
        registry.unavailable.push({ id: tool.id, reason });
      },
    };

    host.registries.push(registry);

    return registry;
  },
}));

import { MAX_HISTORY_MESSAGES, MAX_REPLAYED_RESULT_CHARACTERS } from '../../chat/chat_history_limits';
import type { ChatManager } from '../../chat/chat_manager';
import type { ChatMessage } from '../../chat/chat_message';
import type { McpManager } from '../../mcp';
import type { PermissionStore } from '../../permissions';
import type { ChatRequest } from '../../providers/chat_request';
import type { ChatStreamHandler } from '../../providers/chat_stream_handler';
import type { FileToolServices } from '../../tools';
import type { ToolRound } from '../../tools/tool_round';
import { GenerationController } from '../generation_controller';

type StreamChat = (request: ChatRequest, handler: ChatStreamHandler, signal: AbortSignal) => Promise<void>;

const SHA = 'a'.repeat(64);
const sessionId = 's1';
let messages: ChatMessage[];
let remembered: { role: string; content: string; toolRounds?: ToolRound[] }[];
let failRemember: 'no' | 'throw' | 'false';
let posted: Record<string, unknown>[];
let streamChat: ReturnType<typeof vi.fn<StreamChat>>;
let mcpTools: unknown[] | Error;
let controller: GenerationController;

const chatManager = {
  getActiveSession: () => (activeSession ? { id: sessionId, messages } : undefined),
  addMessageToSession: async (_id: string, role: string, content: string, toolRounds?: ToolRound[]) => {
    if (failRemember === 'throw') {
      throw new Error('disk full');
    }

    remembered.push({ role, content, toolRounds });

    return failRemember !== 'false';
  },
};
let activeSession = true;

const view = () => ({ webview: { postMessage: (message: Record<string, unknown>) => void posted.push(message) } });
const types = () => posted.map((message) => message.type);
const lastRequest = () => streamChat.mock.calls.at(-1)?.[0] as ChatRequest;
const turn = (role: 'user' | 'assistant', content: string, toolRounds?: ToolRound[]): ChatMessage => ({
  role,
  content,
  createdAt: '2026-11-19T10:00:00.000Z',
  ...(toolRounds && { toolRounds }),
});
const send = (text = 'hello') => controller.sendChatMessage(view() as never, text);

describe('GenerationController', () => {
  beforeEach(() => {
    messages = [];
    remembered = [];
    failRemember = 'no';
    posted = [];
    activeSession = true;
    mcpTools = [];
    host.warnings = [];
    host.storeSends = 0;
    host.registries = [];
    host.guardArgs = [];
    host.unavailable = {};
    host.config = { provider: 'ollama', providerUrl: 'http://h:1', autonomyMode: 'confirm' };
    streamChat = vi.fn<StreamChat>(async (_request, handler) => {
      handler.onStart();
      handler.onChunk('the answer');
      handler.onEnd();
    });
    host.provider = { supportsTools: true, streamChat: (...args: Parameters<StreamChat>) => streamChat(...args) };
    controller = new GenerationController(
      chatManager as unknown as ChatManager,
      {} as PermissionStore,
      {
        createTools: async () => {
          if (mcpTools instanceof Error) {
            throw mcpTools;
          }

          return mcpTools;
        },
      } as unknown as McpManager,
      {} as FileToolServices,
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('a normal message', () => {
    it('stores the question, streams the answer to the view, then stores the answer', async () => {
      await send('what is this?');

      expect(remembered).toEqual([
        { role: 'user', content: 'what is this?', toolRounds: undefined },
        { role: 'assistant', content: 'the answer', toolRounds: [] },
      ]);
      expect(types()).toEqual(['responseStart', 'responseChunk', 'responseEnd']);
      expect(posted[1]).toMatchObject({ sessionId, text: 'the answer' });
      expect(host.storeSends).toBe(2);
    });

    it('hands the provider the question, the context and the tools', async () => {
      await send('question');

      const request = lastRequest();

      expect(request.message).toBe('question');
      expect(request.context.editor.activeFile?.path).toBe('/w/a.ts');
      expect(request.tools).toBe(host.registries[0]);
      expect(request.history).toEqual([]);
    });

    it('reads the autonomy mode from the settings each time the guard asks', async () => {
      await send();

      host.config.autonomyMode = 'auto';

      expect(((host.guardArgs[0] as unknown[])[1] as () => string)()).toBe('auto');
    });

    it('does nothing when there is no active conversation', async () => {
      activeSession = false;

      await send();

      expect(streamChat).not.toHaveBeenCalled();
      expect(posted).toEqual([]);
    });

    it('gives no tools to a provider that does not use them', async () => {
      host.provider = { supportsTools: false, streamChat: (...args: Parameters<StreamChat>) => streamChat(...args) };

      await send();

      expect(lastRequest().tools).toBeUndefined();
      expect(host.registries).toEqual([]);
    });

    it('does not store an empty answer', async () => {
      streamChat.mockImplementationOnce(async (_request, handler) => {
        handler.onStart();
        handler.onChunk('   ');
        handler.onEnd();
      });

      await send();

      expect(remembered.map((entry) => entry.role)).toEqual(['user']);
    });

    it('stops without calling the provider when the question cannot be stored', async () => {
      failRemember = 'false';

      await send();

      expect(streamChat).not.toHaveBeenCalled();
      expect(types()).toEqual(['responseStopped']);
    });

    it('goes on and warns the user when the storage fails, since the answer must not be lost with it', async () => {
      failRemember = 'throw';

      await send();

      expect(streamChat).toHaveBeenCalled();
      expect(host.warnings).toEqual(['notify.error:{"error":"disk full"}', 'notify.error:{"error":"disk full"}']);
    });
  });

  describe('the tools', () => {
    it('registers the MCP tools that are available and records why the others are not', async () => {
      host.unavailable = { blocked: 'denied by the user in the permission settings' };
      mcpTools = [{ id: 'ok' }, { id: 'blocked' }];

      await send();

      const registry = host.registries[0] as {
        registered: { id: string }[];
        unavailable: { id: string; reason: string }[];
      };

      expect(registry.registered).toEqual([{ id: 'ok' }]);
      expect(registry.unavailable).toEqual([
        { id: 'blocked', reason: 'denied by the user in the permission settings' },
      ]);
    });

    it('does not start the MCP servers in read-only mode', async () => {
      host.config.autonomyMode = 'readOnly';
      mcpTools = [{ id: 'ok' }];

      await send();

      expect((host.registries[0] as { registered: unknown[] }).registered).toEqual([]);
    });

    it('keeps the built-in tools when an MCP server breaks', async () => {
      mcpTools = new Error('server crashed');

      await send();

      expect(streamChat).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('MCP tools unavailable'));
    });
  });

  describe('the tool rounds that are stored', () => {
    const observations = [
      { path: '/w/a.ts', sha: SHA, complete: false, origin: 'read' as const, text: 'part of the file' },
    ];

    it('stores the results whole, as the model received them, with the observations that go with them', async () => {
      const long = `{"status":"success","content":"${'x'.repeat(20_000)}"}`;
      const round: ToolRound = {
        content: 'reading',
        calls: [{ name: 'read_file', arguments: { path: 'a' }, result: long, observations }],
      };

      streamChat.mockImplementationOnce(async (_request, handler) => {
        handler.onStart();
        handler.onToolRound?.(round);
        handler.onChunk('reading done');
        handler.onEnd();
      });

      await send();

      const stored = remembered.at(-1)?.toolRounds?.[0];

      expect(stored?.calls[0]?.result).toBe(long);
      expect(stored?.calls[0]?.observations).toEqual(observations);
      expect(stored?.calls[0]?.result.length).toBeGreaterThan(MAX_REPLAYED_RESULT_CHARACTERS);
    });

    it('stores a message made only of tool rounds, with no text', async () => {
      streamChat.mockImplementationOnce(async (_request, handler) => {
        handler.onToolRound?.({ content: '', calls: [{ name: 'x', arguments: {}, result: '{}' }] });
      });

      await send();

      expect(remembered.at(-1)).toMatchObject({ role: 'assistant', content: '' });
      expect(remembered.at(-1)?.toolRounds).toHaveLength(1);
    });
  });

  describe('the history sent to the provider', () => {
    it('replays the earlier turns in order', async () => {
      messages = [turn('user', 'q1'), turn('assistant', 'a1'), turn('user', 'q2'), turn('assistant', 'a2')];

      await send();

      expect(lastRequest().history).toEqual([
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
      ]);
    });

    it('leaves out the errors shown in the chat, which the model never said', async () => {
      messages = [turn('user', 'q'), turn('assistant', 'Error: HTTP 500'), turn('assistant', 'a real answer')];

      await send();

      expect(lastRequest().history?.map((entry) => entry.content)).toEqual(['q', 'a real answer']);
    });

    it('replays tool traffic, cut to what a request may hold, and without the file observations', async () => {
      const long = `{"status":"success","content":"${'y'.repeat(20_000)}"}`;

      messages = [
        turn('assistant', 'Reading. Done.', [
          {
            content: 'Reading. ',
            calls: [
              {
                name: 'read_file',
                arguments: { path: 'a' },
                result: long,
                observations: [{ path: '/w/a', sha: SHA, complete: true, origin: 'read' }],
              },
            ],
          },
        ]),
      ];
      host.provider = {
        supportsTools: true,
        resolveContextTokens: async () => 200_000,
        streamChat: (...args: Parameters<StreamChat>) => streamChat(...args),
      };

      await send();

      const [entry] = lastRequest().history ?? [];
      const call = entry?.toolRounds?.[0]?.calls[0];

      expect(entry?.content).toBe('Done.');
      expect(call?.result).toBe(`${long.slice(0, MAX_REPLAYED_RESULT_CHARACTERS)}\n/* result cut in history */`);
      expect(call).not.toHaveProperty('observations');
      expect(messages[0]?.toolRounds?.[0]?.calls[0]?.result).toBe(long);
      expect(messages[0]?.toolRounds?.[0]?.calls[0]?.observations).toHaveLength(1);
    });

    it('keeps only the written text of a turn whose tool results do not fit', async () => {
      const big = 'z'.repeat(3_900);
      const round = (index: number): ToolRound => ({
        content: '',
        calls: [{ name: 'read_file', arguments: { index }, result: big }],
      });

      messages = [
        turn('assistant', 'old answer', [round(1), round(2), round(3), round(4), round(5), round(6), round(7)]),
        turn('user', 'recent question'),
      ];

      await send();

      expect(lastRequest().history).toEqual([
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'recent question' },
      ]);
    });

    it('keeps the most recent turns that fit the budget, and drops the oldest', async () => {
      messages = Array.from({ length: 12 }, (_, index) =>
        turn(index % 2 === 0 ? 'user' : 'assistant', `${index}:${'w'.repeat(3_000)}`),
      );

      await send();

      const kept = lastRequest().history ?? [];

      expect(kept.length).toBeGreaterThan(0);
      expect(kept.length).toBeLessThan(12);
      expect(kept.at(-1)?.content.startsWith('11:')).toBe(true);
      expect(kept.reduce((total, entry) => total + entry.content.length, 0)).toBeLessThanOrEqual(24_000);
    });

    it('never drops the most recent turn whole, but keeps its end', async () => {
      messages = [turn('user', `${'a'.repeat(30_000)}THE END`)];

      await send();

      const [entry] = lastRequest().history ?? [];

      expect(entry?.content.endsWith('THE END')).toBe(true);
      expect(entry?.content.length).toBe(24_000);
    });

    it('sizes the budget to the context window the provider reports', async () => {
      messages = Array.from({ length: 6 }, (_, index) => turn('user', `${index}:${'v'.repeat(2_000)}`));
      host.provider = {
        supportsTools: true,
        resolveContextTokens: async () => 2_048,
        streamChat: (...args: Parameters<StreamChat>) => streamChat(...args),
      };

      await send();

      // 40% of 2048 tokens at 3 characters per token.
      expect(
        (lastRequest().history ?? []).reduce((total, entry) => total + entry.content.length, 0),
      ).toBeLessThanOrEqual(2_457);
    });

    it('replays at most the number of messages allowed', async () => {
      messages = Array.from({ length: MAX_HISTORY_MESSAGES + 10 }, (_, index) => turn('user', `m${index}`));

      await send();

      const history = lastRequest().history ?? [];

      expect(history).toHaveLength(MAX_HISTORY_MESSAGES);
      expect(history.at(-1)?.content).toBe(`m${MAX_HISTORY_MESSAGES + 9}`);
    });
  });

  describe('when it goes wrong', () => {
    it('shows the error as an answer, stores it, and reports the provider as disconnected', async () => {
      streamChat.mockRejectedValueOnce(new Error('connection refused'));

      await send();

      expect(remembered.at(-1)).toMatchObject({ role: 'assistant' });
      expect(remembered.at(-1)?.content).toContain('chat.errorPrefix');
      expect(remembered.at(-1)?.content).toContain('connection refused');
      expect(types()).toEqual(['responseEnd', 'backendStatus']);
      expect(posted[1]).toMatchObject({ status: 'disconnected', backendUrl: 'http://h:1' });
    });

    it('stores what had been answered when the generation is stopped, and says it was stopped', async () => {
      streamChat.mockImplementationOnce(async (_request, handler, signal) => {
        handler.onStart();
        handler.onChunk('partial');
        controller.stopGeneration();

        expect(signal.aborted).toBe(true);

        throw new Error('Generation aborted');
      });

      await send();

      expect(remembered.at(-1)).toMatchObject({ role: 'assistant', content: 'partial' });
      expect(types().at(-1)).toBe('responseStopped');
      expect(types()).not.toContain('backendStatus');
    });

    it('stores the tool rounds done before it was stopped, even without text', async () => {
      streamChat.mockImplementationOnce(async (_request, handler) => {
        handler.onToolRound?.({ content: '', calls: [{ name: 'update_file', arguments: {}, result: '{}' }] });
        controller.stopGeneration();

        throw new Error('Generation aborted');
      });

      await send();

      expect(remembered.at(-1)?.toolRounds).toHaveLength(1);
    });

    it('stores nothing more when it is stopped before anything was produced', async () => {
      streamChat.mockImplementationOnce(async () => {
        controller.stopGeneration();

        throw new Error('Generation aborted');
      });

      await send();

      expect(remembered.map((entry) => entry.role)).toEqual(['user']);
      expect(types()).toEqual(['responseStopped']);
    });
  });

  describe('stopping', () => {
    it('is harmless when nothing is running', () => {
      expect(() => controller.stopGeneration()).not.toThrow();
    });

    it('waits for the generation of that conversation to end, and only that one', async () => {
      let release: () => void = () => undefined;

      streamChat.mockImplementationOnce(
        (_request, _handler, signal) =>
          new Promise<void>((_resolve, reject) => {
            release = () => reject(new Error('Generation aborted'));
            signal.addEventListener('abort', release);
          }),
      );

      const running = send();

      await new Promise((resolve) => setTimeout(resolve, 10));
      await controller.stopGenerationForSessionAndWait('another session');

      expect(streamChat.mock.calls[0]?.[2].aborted).toBe(false);

      await controller.stopGenerationForSessionAndWait(sessionId);
      await running;

      expect(streamChat.mock.calls[0]?.[2].aborted).toBe(true);
      expect(types().at(-1)).toBe('responseStopped');
    });

    it('returns at once when no generation is running', async () => {
      await expect(controller.stopGenerationForSessionAndWait(sessionId)).resolves.toBeUndefined();
    });

    it('cancels the generation still running when a new message starts', async () => {
      const signals: AbortSignal[] = [];
      let first: ((value?: unknown) => void) | undefined;

      streamChat.mockImplementationOnce(async (_request, _handler, signal) => {
        signals.push(signal);
        await new Promise((resolve) => {
          first = resolve;
        });
      });

      const running = send('one');

      await new Promise((resolve) => setTimeout(resolve, 10));
      await send('two');

      expect(signals[0]?.aborted).toBe(true);

      first?.();
      await running;
    });
  });
});
