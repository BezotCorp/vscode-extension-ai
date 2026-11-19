import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n', () => ({
  defaultChatTitle: () => 'New conversation',
  isDefaultChatTitle: (title: string) => ['New chat', 'New conversation', 'Nouvelle conversation'].includes(title),
}));

import { ChatManager } from '../chat_manager';
import type { ChatStorage } from '../chat_storage';
import { CHAT_STORE_VERSION } from '../chat_storage_constants';
import type { ChatStore } from '../chat_store';

function makeStorage(initial?: ChatStore) {
  return {
    load: vi.fn(async () => initial),
    save: vi.fn(async (_store: ChatStore) => undefined),
  };
}

const manager = (storage: ReturnType<typeof makeStorage>) => new ChatManager(storage as unknown as ChatStorage);
const saved = (storage: ReturnType<typeof makeStorage>) => storage.save.mock.calls.at(-1)?.[0] as ChatStore;

function storedWith(...sessions: Partial<ChatStore['sessions'][number]>[]): ChatStore {
  return {
    version: CHAT_STORE_VERSION,
    activeSessionId: sessions[0]?.id ?? '',
    sessions: sessions.map((session, index) => ({
      id: `s${index}`,
      title: `Chat ${index}`,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      messages: [],
      ...session,
    })),
  };
}

describe('ChatManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('load', () => {
    it('starts with one empty conversation when nothing is stored', async () => {
      const chat = manager(makeStorage());

      await chat.load();

      expect(chat.getStore().sessions).toHaveLength(1);
      expect(chat.getActiveSession()?.messages).toEqual([]);
    });

    it('opens the most recent conversation that has messages', async () => {
      const message = { role: 'user' as const, content: 'hi', createdAt: '2026-11-01T10:00:00.000Z' };
      const chat = manager(
        makeStorage(
          storedWith(
            { id: 'empty' },
            { id: 'old', messages: [message], updatedAt: '2026-11-01T10:00:00.000Z' },
            { id: 'recent', messages: [message], updatedAt: '2026-11-10T10:00:00.000Z' },
          ),
        ),
      );

      await chat.load();

      expect(chat.getActiveSession()?.id).toBe('recent');
    });
  });

  describe('getStore and getActiveSession', () => {
    it('hands out copies, so a caller cannot change what the manager keeps', async () => {
      const chat = manager(makeStorage());

      await chat.load();
      chat.getStore().sessions.length = 0;
      chat.getStore().sessions[0]?.messages.push({ role: 'user', content: 'x', createdAt: '' });

      expect(chat.getStore().sessions).toHaveLength(1);
      expect(chat.getStore().sessions[0]?.messages).toEqual([]);
    });
  });

  describe('sessions', () => {
    it('creates a conversation and saves, but reuses the empty one that is already there', async () => {
      const storage = makeStorage();
      const chat = manager(storage);

      await chat.load();

      const first = await chat.createSession('Title');

      expect(chat.getStore().sessions).toHaveLength(1);

      await chat.addMessageToSession(first.id, 'user', 'hello');

      const second = await chat.createSession('Another');

      expect(second.id).not.toBe(first.id);
      expect(chat.getActiveSession()?.id).toBe(second.id);
      expect(saved(storage).sessions).toHaveLength(2);
    });

    it('switches the active conversation, and ignores one that does not exist', async () => {
      const storage = makeStorage(storedWith({ id: 'a' }, { id: 'b' }));
      const chat = manager(storage);

      await chat.load();
      storage.save.mockClear();

      expect((await chat.setActiveSession('b'))?.id).toBe('b');
      expect(chat.getActiveSession()?.id).toBe('b');
      expect(await chat.setActiveSession('nope')).toBeUndefined();
      expect(storage.save).toHaveBeenCalledTimes(1);
    });

    it('renames, archives, restores, trashes and deletes, saving each time', async () => {
      const storage = makeStorage(storedWith({ id: 'a' }, { id: 'b' }));
      const chat = manager(storage);
      const find = (id: string) => chat.getStore().sessions.find((session) => session.id === id);

      await chat.load();
      storage.save.mockClear();

      await chat.renameSession('b', 'Renamed');
      expect(find('b')?.title).toBe('Renamed');

      await chat.archiveSession('b');
      expect(find('b')?.archivedAt).toBeDefined();

      await chat.restoreArchivedSession('b');
      expect(find('b')?.archivedAt).toBeUndefined();

      await chat.trashSession('b');
      expect(find('b')?.trashedAt).toBeDefined();

      await chat.restoreTrashedSession('b');
      expect(find('b')?.trashedAt).toBeUndefined();

      await chat.trashSession('b');
      await chat.deleteTrashedSession('b');
      expect(find('b')).toBeUndefined();

      expect(storage.save).toHaveBeenCalledTimes(7);
    });

    it('moves the archived conversations to the trash, and empties the trash', async () => {
      const chat = manager(makeStorage(storedWith({ id: 'a' }, { id: 'b' }, { id: 'c' })));

      await chat.load();
      await chat.archiveSession('b');
      await chat.trashArchivedSessions();

      expect(chat.getStore().sessions.find((session) => session.id === 'b')?.trashedAt).toBeDefined();

      await chat.emptyTrash();

      expect(chat.getStore().sessions.map((session) => session.id)).toEqual(['a', 'c']);
    });

    it('always keeps one conversation to write in', async () => {
      const chat = manager(makeStorage(storedWith({ id: 'a' })));

      await chat.load();
      await chat.trashSession('a');

      expect(chat.getActiveSession()).toBeDefined();
      expect(chat.getActiveSession()?.id).not.toBe('a');
    });
  });

  describe('messages', () => {
    it('adds a message with its tool rounds and saves it', async () => {
      const storage = makeStorage(storedWith({ id: 'a' }));
      const chat = manager(storage);
      const rounds = [{ content: 'working', calls: [{ name: 'read_file', arguments: {}, result: 'ok' }] }];

      await chat.load();

      expect(await chat.addMessageToSession('a', 'assistant', 'done', rounds)).toBe(true);

      const message = saved(storage).sessions[0]?.messages[0];

      expect(message).toMatchObject({ role: 'assistant', content: 'done', toolRounds: rounds });
      expect(saved(storage).sessions[0]?.updatedAt).toBe('2026-11-19T10:00:00.000Z');
    });

    it('says when the conversation does not exist, and saves nothing', async () => {
      const storage = makeStorage();
      const chat = manager(storage);

      await chat.load();
      storage.save.mockClear();

      expect(await chat.addMessageToSession('nope', 'user', 'x')).toBe(false);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('keeps the message in memory when it cannot be saved, and lets the error out', async () => {
      const storage = makeStorage(storedWith({ id: 'a' }));
      const chat = manager(storage);

      await chat.load();
      storage.save.mockRejectedValueOnce(new Error('disk full'));

      await expect(chat.addMessageToSession('a', 'user', 'kept')).rejects.toThrow('disk full');
      expect(chat.getActiveSession()?.messages.map((message) => message.content)).toEqual(['kept']);
    });

    it('clears the active conversation', async () => {
      const storage = makeStorage(storedWith({ id: 'a' }));
      const chat = manager(storage);

      await chat.load();
      await chat.addMessageToSession('a', 'user', 'hello');
      await chat.clearActiveSession();

      expect(chat.getActiveSession()?.messages).toEqual([]);
      expect(saved(storage).sessions[0]?.messages).toEqual([]);
    });
  });
});
