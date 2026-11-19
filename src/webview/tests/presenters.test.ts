import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  config: { provider: 'ollama', providerUrl: 'http://h:1' },
  health: { status: 'connected', providerUrl: 'http://h:1', text: 'is up' },
  created: [] as unknown[],
}));

vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));
vi.mock('../../config/extension_config', () => ({ getExtensionConfig: () => host.config }));
vi.mock('../../providers/provider_factory', () => ({
  createProvider: (config: unknown) => {
    host.created.push(config);

    return { health: async () => host.health };
  },
}));

import type { ChatManager } from '../../chat/chat_manager';
import type { ModelManager } from '../../models/model_manager';
import { sendChatStore } from '../chat_store_presenter';
import { sendModelState, testConnection } from '../model_state_presenter';

const view = () => ({ webview: { postMessage: vi.fn() } });
const posted = (webview: ReturnType<typeof view>) => webview.webview.postMessage.mock.calls.map((call) => call[0]);

describe('sendChatStore', () => {
  it('sends the list of conversations and the messages of the active one, as they are displayed', () => {
    const toolRound = {
      content: 'working. ',
      calls: [{ name: 'read_file', arguments: {}, result: '{"status":"success"}' }],
    };
    const session = {
      id: 's1',
      title: 'Title',
      createdAt: 'c',
      updatedAt: 'u',
      archivedAt: 'a',
      messages: [
        { role: 'user', content: 'hi', createdAt: 't1' },
        { role: 'assistant', content: 'working. done', createdAt: 't2', toolRounds: [toolRound] },
      ],
    };
    const chat = {
      getStore: () => ({ activeSessionId: 's1', sessions: [session, { ...session, id: 's2', messages: [] }] }),
      getActiveSession: () => session,
    };
    const webview = view();

    sendChatStore(webview as never, chat as unknown as ChatManager);

    const [message] = posted(webview);

    expect(message).toMatchObject({ type: 'chatStoreRestored', activeSessionId: 's1' });
    expect(message.sessions).toEqual([
      {
        id: 's1',
        title: 'Title',
        createdAt: 'c',
        updatedAt: 'u',
        archivedAt: 'a',
        trashedAt: undefined,
        messageCount: 2,
      },
      {
        id: 's2',
        title: 'Title',
        createdAt: 'c',
        updatedAt: 'u',
        archivedAt: 'a',
        trashedAt: undefined,
        messageCount: 0,
      },
    ]);
    expect(message.messages[0]).toEqual({ role: 'user', content: 'hi', createdAt: 't1' });
    expect(message.messages[1].content).toContain('[tool] read_file {}');
    expect(message.messages[1].content).toContain('[tool] -> success');
    expect(message.messages[1].content.endsWith('done')).toBe(true);
  });

  it('sends no messages when there is no active conversation', () => {
    const webview = view();

    sendChatStore(
      webview as never,
      {
        getStore: () => ({ activeSessionId: '', sessions: [] }),
        getActiveSession: () => undefined,
      } as unknown as ChatManager,
    );

    expect(posted(webview)[0].messages).toEqual([]);
  });

  it('does not send what the conversation stores for the model, such as observations', () => {
    const session = {
      id: 's',
      title: 't',
      createdAt: '',
      updatedAt: '',
      messages: [
        {
          role: 'assistant',
          content: 'x',
          createdAt: '',
          toolRounds: [
            {
              content: '',
              calls: [
                {
                  name: 'read_file',
                  arguments: {},
                  result: '{"status":"success"}',
                  observations: [
                    { path: '/secret', sha: 'a'.repeat(64), complete: false, origin: 'read', text: 'PRIVATE TEXT' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const webview = view();

    sendChatStore(
      webview as never,
      {
        getStore: () => ({ activeSessionId: 's', sessions: [session] }),
        getActiveSession: () => session,
      } as unknown as ChatManager,
    );

    expect(JSON.stringify(posted(webview))).not.toContain('PRIVATE TEXT');
  });
});

describe('model state presenter', () => {
  beforeEach(() => {
    host.created = [];
    host.health = { status: 'connected', providerUrl: 'http://h:1', text: 'is up' };
  });

  it('sends the state of the models', async () => {
    const webview = view();
    const state = { provider: 'ollama', providerUrl: 'http://h:1', activeModel: 'm', models: [] };

    await sendModelState(webview as never, { getState: async () => state } as unknown as ModelManager);

    expect(posted(webview)).toEqual([{ type: 'modelState', ...state }]);
  });

  it('tells that it is connecting, then what the provider answered', async () => {
    const webview = view();

    await testConnection(webview as never);

    expect(posted(webview)).toEqual([
      {
        type: 'backendStatus',
        status: 'connecting',
        backendUrl: 'http://h:1',
        text: 'status.connecting:{"provider":"ollama"}',
      },
      { type: 'backendStatus', status: 'connected', backendUrl: 'http://h:1', text: 'is up' },
    ]);
    expect(host.created).toEqual([host.config]);
  });

  it('shows a provider that is not reachable', async () => {
    host.health = { status: 'disconnected', providerUrl: 'http://h:1', text: 'refused' };

    const webview = view();

    await testConnection(webview as never);

    expect(posted(webview)[1]).toMatchObject({ status: 'disconnected', text: 'refused' });
  });
});
