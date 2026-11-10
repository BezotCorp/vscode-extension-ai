import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../chat_message';
import {
  addMessageToChatSession,
  clearChatSession,
  cloneChatSession,
  createChatSession,
  createChatSessionFromLegacy,
  normalizeChatSession,
  renameChatSession,
  type ChatSession,
} from '../chat_session';

vi.mock('../../i18n', () => ({
  defaultChatTitle: () => 'New conversation',
  isDefaultChatTitle: (title: string) => ['New chat', 'New conversation', 'Nouvelle conversation'].includes(title),
}));

describe('chat_session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createChatSession', () => {
    it('creates a session with the default title', () => {
      const session = createChatSession();

      expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(session.title).toBe('New conversation');
      expect(session.createdAt).toBe('2026-11-06T10:00:00.000Z');
      expect(session.updatedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(session.messages).toEqual([]);
      expect(session.archivedAt).toBeUndefined();
      expect(session.trashedAt).toBeUndefined();
    });

    it('uses the provided title', () => {
      const session = createChatSession('My conversation');

      expect(session.title).toBe('My conversation');
    });

    it('rejects an empty title', () => {
      expect(() => createChatSession('')).toThrow('Title cannot be empty');
    });
  });

  describe('createChatSessionFromLegacy', () => {
    it('creates a session from legacy messages', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: 'Hello',
          createdAt: '2026-11-01T08:00:00.000Z',
        },
        {
          role: 'user',
          content: '  Build   the   feature  ',
          createdAt: '2026-11-01T08:01:00.000Z',
        },
        {
          role: 'assistant',
          content: 'Done',
          createdAt: '2026-11-01T08:02:00.000Z',
        },
      ];

      const session = createChatSessionFromLegacy('legacy-id', messages);

      expect(session.id).toBe('legacy-id');
      expect(session.title).toBe('Build the feature');
      expect(session.createdAt).toBe('2026-11-01T08:00:00.000Z');
      expect(session.updatedAt).toBe('2026-11-01T08:02:00.000Z');
      expect(session.messages).toEqual(messages);
      expect(session.messages).not.toBe(messages);

      for (let index = 0; index < messages.length; index++) {
        expect(session.messages[index]).not.toBe(messages[index]);
      }
    });

    it('uses the default title when there is no user message', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: 'Hello',
          createdAt: '2026-11-01T08:00:00.000Z',
        },
      ];

      const session = createChatSessionFromLegacy('legacy-id', messages);

      expect(session.title).toBe('New conversation');
    });

    it('rejects an empty id', () => {
      expect(() => createChatSessionFromLegacy('', [])).toThrow('Invalid input');
    });
  });

  describe('cloneChatSession', () => {
    it('clones the session and its messages', () => {
      const session = createChatSession('Original');

      addMessageToChatSession(session, 'user', 'Hello');

      const clone = cloneChatSession(session);

      expect(clone).toEqual(session);
      expect(clone).not.toBe(session);
      expect(clone.messages).not.toBe(session.messages);
      expect(clone.messages[0]).not.toBe(session.messages[0]);
    });
  });

  describe('addMessageToChatSession', () => {
    it('adds a message and updates the session timestamp', () => {
      const session = createChatSession('Custom title');

      vi.setSystemTime(new Date('2026-11-06T10:05:00.000Z'));

      addMessageToChatSession(session, 'assistant', 'Hello');

      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toEqual({
        role: 'assistant',
        content: 'Hello',
        createdAt: '2026-11-06T10:05:00.000Z',
      });
      expect(session.updatedAt).toBe('2026-11-06T10:05:00.000Z');
    });

    it('uses the first user message as the title when the title is still default', () => {
      const session = createChatSession();

      addMessageToChatSession(session, 'user', '  Implement   permissions   correctly  ');

      expect(session.title).toBe('Implement permissions correctly');
    });

    it('does not replace a custom title', () => {
      const session = createChatSession('Custom title');

      addMessageToChatSession(session, 'user', 'New user message');

      expect(session.title).toBe('Custom title');
    });

    it('limits a generated title to 48 characters followed by an ellipsis', () => {
      const session = createChatSession();
      const content = 'a'.repeat(60);

      addMessageToChatSession(session, 'user', content);

      expect(session.title).toBe(`${'a'.repeat(48)}...`);
    });

    it('keeps the default title for an empty user message', () => {
      const session = createChatSession();

      addMessageToChatSession(session, 'user', '   ');

      expect(session.title).toBe('New conversation');
    });
  });

  describe('clearChatSession', () => {
    it('clears messages, restores the default title and updates the timestamp', () => {
      const session = createChatSession('Custom title');

      addMessageToChatSession(session, 'assistant', 'Hello');

      vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

      clearChatSession(session);

      expect(session.title).toBe('New conversation');
      expect(session.messages).toEqual([]);
      expect(session.updatedAt).toBe('2026-11-06T11:00:00.000Z');
    });
  });

  describe('renameChatSession', () => {
    it('trims and applies a new title', () => {
      const session = createChatSession();

      vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

      renameChatSession(session, '  Renamed conversation  ');

      expect(session.title).toBe('Renamed conversation');
      expect(session.updatedAt).toBe('2026-11-06T11:00:00.000Z');
    });

    it('ignores an empty title without changing updatedAt', () => {
      const session = createChatSession('Existing title');
      const updatedAt = session.updatedAt;

      vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

      renameChatSession(session, '   ');

      expect(session.title).toBe('Existing title');
      expect(session.updatedAt).toBe(updatedAt);
    });
  });

  describe('normalizeChatSession', () => {
    it('preserves valid session data', () => {
      const session: ChatSession = {
        id: 'session-id',
        title: 'Custom title',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T09:00:00.000Z',
        archivedAt: '2026-11-02T08:00:00.000Z',
        trashedAt: '2026-11-03T08:00:00.000Z',
        messages: [
          {
            role: 'user',
            content: 'Hello',
            createdAt: '2026-11-01T08:30:00.000Z',
          },
        ],
      };

      const normalized = normalizeChatSession(session);

      expect(normalized).toEqual(session);
      expect(normalized).not.toBe(session);
      expect(normalized.messages).not.toBe(session.messages);
      expect(normalized.messages[0]).not.toBe(session.messages[0]);
    });

    it('normalizes an old default title to the current default title', () => {
      const session = createChatSession('New chat');

      const normalized = normalizeChatSession(session);

      expect(normalized.title).toBe('New conversation');
    });

    it('generates missing identity and timestamps', () => {
      const session = {
        id: '',
        title: '',
        createdAt: '',
        updatedAt: '',
        messages: [],
      } satisfies ChatSession;

      const normalized = normalizeChatSession(session);

      expect(normalized.id).not.toBe('');
      expect(normalized.title).toBe('New conversation');
      expect(normalized.createdAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.updatedAt).toBe('2026-11-06T10:00:00.000Z');
    });

    it('uses createdAt when updatedAt is missing', () => {
      const session = {
        id: 'session-id',
        title: 'Title',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '',
        messages: [],
      } satisfies ChatSession;

      const normalized = normalizeChatSession(session);

      expect(normalized.updatedAt).toBe('2026-11-01T08:00:00.000Z');
    });

    it('drops invalid archive and trash timestamps and invalid messages', () => {
      const session = {
        id: 'session-id',
        title: 'Title',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z',
        archivedAt: 42,
        trashedAt: false,
        messages: null,
      } as unknown as ChatSession;

      const normalized = normalizeChatSession(session);

      expect(normalized.archivedAt).toBeUndefined();
      expect(normalized.trashedAt).toBeUndefined();
      expect(normalized.messages).toEqual([]);
    });
  });

  describe('normalizeChatSession edge cases', () => {
    it('handles completely empty session', () => {
      const session = {} as ChatSession;

      const normalized = normalizeChatSession(session);

      expect(normalized.id).not.toBe('');
      expect(normalized.title).toBe('New conversation');
      expect(normalized.createdAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.updatedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.messages).toEqual([]);
    });
  });

  describe('normalizeChatSession with invalid data', () => {
    it('handles null session', () => {
      const session = null as unknown as ChatSession;

      const normalized = normalizeChatSession(session);

      expect(normalized.id).not.toBe('');
      expect(normalized.title).toBe('New conversation');
      expect(normalized.createdAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.updatedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.messages).toEqual([]);
    });
  });

  describe('normalizeChatSession malformed data', () => {
    it.each([undefined, null, 42, true, 'hello', []])('normalizes non-object input: %p', (input) => {
      const normalized = normalizeChatSession(input);

      expect(normalized.id).not.toBe('');
      expect(normalized.title).toBe('New conversation');
      expect(normalized.createdAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.updatedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.messages).toEqual([]);
    });

    it('drops invalid scalar properties independently', () => {
      const normalized = normalizeChatSession({
        id: 42,
        title: false,
        createdAt: {},
        updatedAt: [],
        archivedAt: 123,
        trashedAt: null,
        messages: 'not-an-array',
      });

      expect(normalized.id).not.toBe('');
      expect(normalized.title).toBe('New conversation');
      expect(normalized.createdAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.updatedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.archivedAt).toBeUndefined();
      expect(normalized.trashedAt).toBeUndefined();
      expect(normalized.messages).toEqual([]);
    });

    it('keeps valid messages and drops malformed ones', () => {
      const normalized = normalizeChatSession({
        id: 'session-id',
        title: 'Title',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z',
        messages: [
          null,
          42,
          'hello',
          {},
          {
            role: 'user',
            content: 'Valid message',
            createdAt: '2026-11-01T09:00:00.000Z',
          },
        ],
      });

      expect(normalized.messages).toEqual([
        {
          role: 'user',
          content: 'Valid message',
          createdAt: '2026-11-01T09:00:00.000Z',
        },
      ]);
    });

    it('drops messages with invalid roles', () => {
      const normalized = normalizeChatSession({
        messages: [
          {
            role: 'system',
            content: 'Nope',
            createdAt: '2026-11-01T09:00:00.000Z',
          },
          {
            role: '',
            content: 'Nope',
            createdAt: '2026-11-01T09:00:00.000Z',
          },
        ],
      });

      expect(normalized.messages).toEqual([]);
    });

    it('drops messages without textual content', () => {
      const normalized = normalizeChatSession({
        messages: [
          {
            role: 'user',
            content: null,
            createdAt: '2026-11-01T09:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 42,
            createdAt: '2026-11-01T09:00:00.000Z',
          },
        ],
      });

      expect(normalized.messages).toEqual([]);
    });

    it('restores a missing message timestamp', () => {
      const normalized = normalizeChatSession({
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      });

      expect(normalized.messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
          createdAt: '2026-11-06T10:00:00.000Z',
        },
      ]);
    });

    it('keeps valid tool rounds and drops malformed ones', () => {
      const normalized = normalizeChatSession({
        messages: [
          {
            role: 'assistant',
            content: 'Result',
            createdAt: '2026-11-01T09:00:00.000Z',
            toolRounds: [
              null,
              42,
              {
                content: 'Working',
                calls: [
                  {
                    name: 'read_file',
                    arguments: { path: 'file.txt' },
                    result: 'content',
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(normalized.messages[0]?.toolRounds).toEqual([
        {
          content: 'Working',
          calls: [
            {
              name: 'read_file',
              arguments: { path: 'file.txt' },
              result: 'content',
            },
          ],
        },
      ]);
    });

    it('drops malformed tool calls but keeps the tool round', () => {
      const normalized = normalizeChatSession({
        messages: [
          {
            role: 'assistant',
            content: 'Result',
            createdAt: '2026-11-01T09:00:00.000Z',
            toolRounds: [
              {
                content: 'Working',
                calls: [
                  null,
                  42,
                  {},
                  {
                    name: 'valid_tool',
                    arguments: null,
                    result: 'ok',
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(normalized.messages[0]?.toolRounds).toEqual([
        {
          content: 'Working',
          calls: [
            {
              name: 'valid_tool',
              arguments: null,
              result: 'ok',
            },
          ],
        },
      ]);
    });
  });

  describe('normalizeChatSession', () => {
    it('handles completely empty session', () => {
      const normalized = normalizeChatSession({});

      expect(normalized.id).not.toBe('');
      expect(normalized.title).toBe('New conversation');
      expect(normalized.createdAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.updatedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(normalized.messages).toEqual([]);
    });
  });

  describe('normalizeChatSession weird values', () => {
    it('normalizes completely nonsensical field values', () => {
      const normalized = normalizeChatSession({
        id: 122,
        title: false,
        createdAt: { lol: true },
        updatedAt: ['hhh'],
        archivedAt: 999,
        trashedAt: Symbol('trash'),
        messages: 12121,
      });

      expect(typeof normalized.id).toBe('string');
      expect(normalized.id.length).toBeGreaterThan(0);
      expect(normalized.title).toBe('New conversation');
      expect(typeof normalized.createdAt).toBe('string');
      expect(typeof normalized.updatedAt).toBe('string');
      expect(normalized.archivedAt).toBeUndefined();
      expect(normalized.trashedAt).toBeUndefined();
      expect(normalized.messages).toEqual([]);
    });
  });

  it('handles malformed nested message data', () => {
    const normalized = normalizeChatSession({
      messages: [
        undefined,
        null,
        42,
        true,
        [],
        {},
        {
          role: 'system',
          content: 'bad role',
          createdAt: {},
        },
        {
          role: 'user',
          content: 123,
          createdAt: null,
        },
        {
          role: 'assistant',
          content: 'valid',
          createdAt: 'nonsense',
          toolRounds: [
            null,
            42,
            {
              content: 123,
              calls: 'nope',
            },
            {
              content: 'valid round',
              calls: [
                null,
                {},
                {
                  name: 42,
                  arguments: Symbol('x'),
                  result: false,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(normalized.messages).toHaveLength(1);
    expect(normalized.messages[0]?.role).toBe('assistant');
    expect(normalized.messages[0]?.content).toBe('valid');
  });

  it('normalizes semantically invalid string values', () => {
    const normalized = normalizeChatSession({
      id: '   ',
      title: '   ',
      createdAt: 'banana',
      updatedAt: 'tomorrow',
      archivedAt: '',
      trashedAt: 'not-a-date',
      messages: [],
    });

    expect(normalized.id.trim()).not.toBe('');
    expect(normalized.title).toBe('New conversation');

    expect(Number.isNaN(Date.parse(normalized.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(normalized.updatedAt))).toBe(false);

    expect(normalized.archivedAt).toBeUndefined();
    expect(normalized.trashedAt).toBeUndefined();
  });
});
