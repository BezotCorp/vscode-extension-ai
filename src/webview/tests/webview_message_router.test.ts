import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  confirmation: undefined as string | undefined,
  warnings: [] as unknown[][],
  errors: [] as string[],
  commands: [] as unknown[][],
  clipboard: [] as string[],
  sentStore: 0,
  connectionTests: 0,
  modelStates: 0,
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: async (...args: unknown[]) => {
      host.warnings.push(args);

      return host.confirmation;
    },
    showErrorMessage: async (message: string) => {
      host.errors.push(message);
    },
  },
  commands: {
    executeCommand: async (...args: unknown[]) => {
      host.commands.push(args);
    },
  },
  env: {
    clipboard: {
      writeText: async (text: string) => {
        host.clipboard.push(text);
      },
    },
  },
}));
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));
vi.mock('../chat_store_presenter', () => ({
  sendChatStore: () => {
    host.sentStore++;
  },
}));
vi.mock('../model_state_presenter', () => ({
  sendModelState: async () => {
    host.modelStates++;
  },
  testConnection: async () => {
    host.connectionTests++;
  },
}));

import type { ChatManager } from '../../chat/chat_manager';
import type { ModelManager } from '../../models/model_manager';
import type { GenerationController } from '../generation_controller';
import type { WebviewMessage } from '../messages';
import { WebviewMessageRouter } from '../webview_message_router';

const calls: string[] = [];
const track = (name: string) =>
  vi.fn(async (...args: unknown[]) => {
    calls.push(`${name}:${args.join(',')}`);
  });

const chat = {
  createSession: track('createSession'),
  setActiveSession: track('setActiveSession'),
  renameSession: track('renameSession'),
  archiveSession: track('archiveSession'),
  restoreArchivedSession: track('restoreArchivedSession'),
  trashSession: track('trashSession'),
  restoreTrashedSession: track('restoreTrashedSession'),
  deleteTrashedSession: track('deleteTrashedSession'),
  clearActiveSession: track('clearActiveSession'),
  trashArchivedSessions: track('trashArchivedSessions'),
  emptyTrash: track('emptyTrash'),
  getActiveSession: vi.fn(() => ({ id: 'active' })),
};
const models = { updateProviderSettings: track('updateProviderSettings'), setActiveModel: track('setActiveModel') };
const generation = {
  stopGeneration: vi.fn(() => void calls.push('stopGeneration')),
  stopGenerationForSessionAndWait: track('stopGenerationForSessionAndWait'),
  sendChatMessage: track('sendChatMessage'),
};

const router = () =>
  new WebviewMessageRouter(
    chat as unknown as ChatManager,
    models as unknown as ModelManager,
    generation as unknown as GenerationController,
  );
const send = (message: WebviewMessage) => router().handle({ webview: {} } as never, message);

describe('WebviewMessageRouter', () => {
  beforeEach(() => {
    calls.length = 0;
    host.confirmation = undefined;
    host.warnings = [];
    host.errors = [];
    host.commands = [];
    host.clipboard = [];
    host.sentStore = 0;
    host.connectionTests = 0;
    host.modelStates = 0;
    vi.clearAllMocks();
    chat.getActiveSession.mockReturnValue({ id: 'active' });
  });

  it('sends everything the view needs when it is ready', async () => {
    await send({ type: 'webviewReady' });

    expect(host.sentStore).toBe(1);
    expect(host.connectionTests).toBe(1);
    expect(host.modelStates).toBe(1);
  });

  it('copies a message to the clipboard and opens the settings of the extension', async () => {
    await send({ type: 'copyMessage', text: 'copied' });
    await send({ type: 'openSettings' });

    expect(host.clipboard).toEqual(['copied']);
    expect(host.commands).toEqual([['workbench.action.openSettings', '@ext:bezotcorp.bezotcorp-ai']]);
  });

  it('tests the connection and refreshes the models', async () => {
    await send({ type: 'testConnection' });
    await send({ type: 'refreshModels' });

    expect(host.connectionTests).toBe(1);
    expect(host.modelStates).toBe(2);
  });

  it('changes the provider settings, then tests the connection and sends the state', async () => {
    await send({ type: 'updateProviderSettings', provider: 'customBackend', providerUrl: 'http://b' });

    expect(calls).toEqual(['updateProviderSettings:customBackend,http://b']);
    expect(host.connectionTests).toBe(1);
    expect(host.modelStates).toBe(1);
  });

  it('changes the model and sends the state', async () => {
    await send({ type: 'changeModel', model: 'llama' });

    expect(calls).toEqual(['setActiveModel:llama']);
    expect(host.modelStates).toBe(1);
  });

  it.each([
    [{ type: 'newChat' }, 'createSession:'],
    [{ type: 'switchChatSession', sessionId: 's' }, 'setActiveSession:s'],
    [{ type: 'renameChatSession', sessionId: 's', title: 'T' }, 'renameSession:s,T'],
    [{ type: 'archiveChatSession', sessionId: 's' }, 'archiveSession:s'],
    [{ type: 'restoreChatSession', sessionId: 's' }, 'restoreArchivedSession:s'],
    [{ type: 'trashChatSession', sessionId: 's' }, 'trashSession:s'],
    [{ type: 'restoreTrashedChatSession', sessionId: 's' }, 'restoreTrashedSession:s'],
    [{ type: 'trashArchivedSessions' }, 'trashArchivedSessions:'],
  ] as [WebviewMessage, string][])('handles %j and refreshes the conversations', async (message, expected) => {
    await send(message);

    expect(calls).toEqual([expected]);
    expect(host.sentStore).toBe(1);
  });

  describe('what needs a confirmation', () => {
    it.each([
      [{ type: 'deleteChatSession', sessionId: 's' }, 'chat.confirm.delete', 'deleteTrashedSession:s'],
      [{ type: 'emptyTrash' }, 'chat.confirm.emptyTrash', 'emptyTrash:'],
      [{ type: 'clearCurrentSession' }, 'chat.confirm.clear', 'clearActiveSession:'],
    ] as [WebviewMessage, string, string][])(
      'asks before %j, and goes on when confirmed',
      async (message, prefix, expected) => {
        host.confirmation = `${prefix}.button`;

        await send(message);

        expect(host.warnings[0]).toEqual([
          `${prefix}.title`,
          { modal: true, detail: `${prefix}.detail` },
          `${prefix}.button`,
        ]);
        expect(calls).toContain(expected);
        expect(host.sentStore).toBe(1);
      },
    );

    it.each([
      [{ type: 'deleteChatSession', sessionId: 's' }],
      [{ type: 'emptyTrash' }],
      [{ type: 'clearCurrentSession' }],
    ] as [WebviewMessage][])('does nothing for %j when it is not confirmed', async (message) => {
      host.confirmation = undefined;

      await send(message);

      expect(calls).toEqual([]);
      expect(host.sentStore).toBe(0);
    });

    it('does not take another answer for a confirmation', async () => {
      host.confirmation = 'something else';

      await send({ type: 'emptyTrash' });

      expect(calls).toEqual([]);
    });

    it('stops the generation of the active conversation, and waits for it, before clearing it', async () => {
      host.confirmation = 'chat.confirm.clear.button';

      await send({ type: 'clearCurrentSession' });

      expect(calls).toEqual(['stopGenerationForSessionAndWait:active', 'clearActiveSession:']);
    });

    it('clears a conversation that has no generation to stop', async () => {
      host.confirmation = 'chat.confirm.clear.button';
      chat.getActiveSession.mockReturnValue(undefined as never);

      await send({ type: 'clearCurrentSession' });

      expect(calls).toEqual(['clearActiveSession:']);
    });
  });

  it('stops the generation, and sends a message to it', async () => {
    await send({ type: 'stopGeneration' });
    await send({ type: 'chat', text: 'hello' });

    expect(calls).toEqual(['stopGeneration', 'sendChatMessage:[object Object],hello']);
  });

  it('shows an error to the user, and sends the conversations again, when handling fails', async () => {
    chat.createSession.mockRejectedValueOnce(new Error('disk full'));

    await send({ type: 'newChat' });

    expect(host.errors).toEqual(['notify.error:{"error":"disk full"}']);
    expect(host.sentStore).toBe(1);

    chat.renameSession.mockRejectedValueOnce('plain failure');

    await send({ type: 'renameChatSession', sessionId: 's', title: 't' });

    expect(host.errors[1]).toBe('notify.error:{"error":"plain failure"}');
  });
});
