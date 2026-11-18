import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  createDirectory: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  deleteFile: vi.fn(),
  copy: vi.fn(),
  showWarningMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
      fsPath: [base.fsPath, ...parts].join('/'),
    }),
  },
  workspace: {
    fs: {
      readFile: mocks.readFile,
      createDirectory: mocks.createDirectory,
      writeFile: mocks.writeFile,
      rename: mocks.rename,
      delete: mocks.deleteFile,
      copy: mocks.copy,
    },
  },
  window: {
    showWarningMessage: mocks.showWarningMessage,
  },
}));

vi.mock('../../i18n', () => ({
  defaultChatTitle: () => 'New conversation',
  isDefaultChatTitle: (title: string) => ['New chat', 'New conversation', 'Nouvelle conversation'].includes(title),
  t: (key: string, params: Record<string, string> = {}) => {
    if (key === 'notify.storageSaveFailed') {
      return `Failed to save chat storage: ${params.error}`;
    }

    if (key === 'notify.storageUnreadable') {
      return `Unreadable chat storage: ${params.reason} (${params.path})`;
    }

    return key;
  },
}));

import { ChatStorage } from '../chat_storage';
import { CHAT_STORE_VERSION } from '../chat_storage_constants';
import type { ChatStore } from '../chat_store';

const storageUri = {
  fsPath: '/storage',
};

function bytes(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function createStore(): ChatStore {
  return {
    version: CHAT_STORE_VERSION,
    activeSessionId: 'session-1',
    sessions: [
      {
        id: 'session-1',
        title: 'Test conversation',
        createdAt: '2026-11-06T10:00:00.000Z',
        updatedAt: '2026-11-06T10:01:00.000Z',
        messages: [
          {
            role: 'user',
            content: 'Hello',
            createdAt: '2026-11-06T10:01:00.000Z',
          },
        ],
      },
    ],
  };
}

describe('chat_storage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z'));

    vi.clearAllMocks();

    mocks.createDirectory.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.rename.mockResolvedValue(undefined);
    mocks.deleteFile.mockResolvedValue(undefined);
    mocks.copy.mockResolvedValue(undefined);
    mocks.showWarningMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('load', () => {
    it('loads and normalizes the current chat store format', async () => {
      const store = createStore();

      mocks.readFile.mockResolvedValue(bytes(store));

      const storage = new ChatStorage(storageUri as never);
      const loaded = await storage.load();

      expect(loaded).toEqual(store);
      expect(loaded).not.toBe(store);
      expect(mocks.readFile).toHaveBeenCalledOnce();
      expect(mocks.readFile).toHaveBeenCalledWith({
        fsPath: '/storage/chat.json',
      });
      expect(mocks.copy).not.toHaveBeenCalled();
    });

    it('returns undefined when the storage file does not exist', async () => {
      mocks.readFile.mockRejectedValue({
        code: 'FileNotFound',
      });

      const storage = new ChatStorage(storageUri as never);
      const loaded = await storage.load();

      expect(loaded).toBeUndefined();
      expect(mocks.copy).not.toHaveBeenCalled();
    });

    it('also recognizes ENOENT as a missing storage file', async () => {
      mocks.readFile.mockRejectedValue({
        code: 'ENOENT',
      });

      const storage = new ChatStorage(storageUri as never);
      const loaded = await storage.load();

      expect(loaded).toBeUndefined();
      expect(mocks.copy).not.toHaveBeenCalled();
    });

    it('migrates a legacy chat session', async () => {
      mocks.readFile.mockResolvedValue(
        bytes({
          id: 'legacy-session',
          messages: [
            {
              role: 'user',
              content: '  Legacy   conversation  ',
              createdAt: '2026-10-01T08:00:00.000Z',
            },
            {
              role: 'assistant',
              content: 'Legacy response',
              createdAt: '2026-10-01T08:01:00.000Z',
            },
          ],
        }),
      );

      const storage = new ChatStorage(storageUri as never);
      const loaded = await storage.load();

      expect(loaded).toEqual({
        version: CHAT_STORE_VERSION,
        activeSessionId: 'legacy-session',
        sessions: [
          {
            id: 'legacy-session',
            title: 'Legacy conversation',
            createdAt: '2026-10-01T08:00:00.000Z',
            updatedAt: '2026-10-01T08:01:00.000Z',
            messages: [
              {
                role: 'user',
                content: '  Legacy   conversation  ',
                createdAt: '2026-10-01T08:00:00.000Z',
              },
              {
                role: 'assistant',
                content: 'Legacy response',
                createdAt: '2026-10-01T08:01:00.000Z',
              },
            ],
          },
        ],
      });
      expect(mocks.copy).not.toHaveBeenCalled();
    });

    it('keeps a copy when the stored format is unknown', async () => {
      mocks.readFile.mockResolvedValue(bytes({ unexpected: true }));

      const storage = new ChatStorage(storageUri as never);
      const loaded = await storage.load();

      expect(loaded).toBeUndefined();
      expect(mocks.copy).toHaveBeenCalledOnce();
      expect(mocks.copy).toHaveBeenCalledWith(
        { fsPath: '/storage/chat.json' },
        { fsPath: '/storage/chat.unreadable-1793959200000.json' },
        { overwrite: false },
      );
      expect(mocks.showWarningMessage).toHaveBeenCalledOnce();
    });

    it('keeps a copy when the JSON cannot be parsed', async () => {
      mocks.readFile.mockResolvedValue(Buffer.from('{invalid-json', 'utf8'));

      const storage = new ChatStorage(storageUri as never);
      const loaded = await storage.load();

      expect(loaded).toBeUndefined();
      expect(mocks.copy).toHaveBeenCalledOnce();
      expect(mocks.showWarningMessage).toHaveBeenCalledOnce();
    });

    it('does not fail loading if the unreadable backup itself cannot be created', async () => {
      mocks.readFile.mockResolvedValue(bytes({ unexpected: true }));
      mocks.copy.mockRejectedValue(new Error('backup failed'));

      const storage = new ChatStorage(storageUri as never);

      await expect(storage.load()).resolves.toBeUndefined();
      expect(mocks.copy).toHaveBeenCalledOnce();
    });
  });

  describe('save', () => {
    it('creates the storage directory and atomically replaces chat.json', async () => {
      const store = createStore();
      const storage = new ChatStorage(storageUri as never);

      await storage.save(store);

      expect(mocks.createDirectory).toHaveBeenCalledWith(storageUri);

      expect(mocks.writeFile).toHaveBeenCalledOnce();
      expect(mocks.writeFile.mock.calls[0]?.[0]).toEqual({
        fsPath: '/storage/chat.json.tmp',
      });

      const written = JSON.parse(Buffer.from(mocks.writeFile.mock.calls[0]?.[1]).toString('utf8'));

      expect(written).toEqual(store);

      expect(mocks.rename).toHaveBeenCalledWith(
        { fsPath: '/storage/chat.json.tmp' },
        { fsPath: '/storage/chat.json' },
        { overwrite: true },
      );
    });

    it('writes the temporary file before renaming it', async () => {
      const order: string[] = [];

      mocks.writeFile.mockImplementation(async () => {
        order.push('write');
      });

      mocks.rename.mockImplementation(async () => {
        order.push('rename');
      });

      const storage = new ChatStorage(storageUri as never);

      await storage.save(createStore());

      expect(order).toEqual(['write', 'rename']);
    });

    it('removes the temporary file when saving fails', async () => {
      mocks.writeFile.mockRejectedValue(new Error('disk full'));

      const storage = new ChatStorage(storageUri as never);

      await expect(storage.save(createStore())).rejects.toThrow('Failed to save chat storage: disk full');

      expect(mocks.deleteFile).toHaveBeenCalledWith({
        fsPath: '/storage/chat.json.tmp',
      });
      expect(mocks.rename).not.toHaveBeenCalled();
    });

    it('rethrows a save failure even if temporary-file cleanup also fails', async () => {
      mocks.writeFile.mockRejectedValue(new Error('disk full'));
      mocks.deleteFile.mockRejectedValue(new Error('cleanup failed'));

      const storage = new ChatStorage(storageUri as never);

      await expect(storage.save(createStore())).rejects.toThrow('Failed to save chat storage: disk full');
    });

    it('serializes concurrent saves', async () => {
      const writes: string[] = [];

      let releaseFirstWrite: (() => void) | undefined;

      const firstWriteBlocked = new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });

      mocks.writeFile
        .mockImplementationOnce(async (_uri, content: Uint8Array) => {
          const parsed = JSON.parse(Buffer.from(content).toString('utf8'));
          writes.push(parsed.sessions[0].title);
          await firstWriteBlocked;
        })
        .mockImplementationOnce(async (_uri, content: Uint8Array) => {
          const parsed = JSON.parse(Buffer.from(content).toString('utf8'));
          writes.push(parsed.sessions[0].title);
        });

      const first = createStore();
      first.sessions[0].title = 'First';

      const second = createStore();
      second.sessions[0].title = 'Second';

      const storage = new ChatStorage(storageUri as never);

      const firstSave = storage.save(first);
      const secondSave = storage.save(second);

      await vi.waitFor(() => {
        expect(writes).toEqual(['First']);
      });

      releaseFirstWrite?.();

      await Promise.all([firstSave, secondSave]);

      expect(writes).toEqual(['First', 'Second']);
      expect(mocks.rename).toHaveBeenCalledTimes(2);
    });

    it('continues the save queue after a failed save', async () => {
      mocks.writeFile.mockRejectedValueOnce(new Error('first failed')).mockResolvedValueOnce(undefined);

      const storage = new ChatStorage(storageUri as never);

      await expect(storage.save(createStore())).rejects.toThrow('Failed to save chat storage: first failed');

      await expect(storage.save(createStore())).resolves.toBeUndefined();

      expect(mocks.writeFile).toHaveBeenCalledTimes(2);
      expect(mocks.rename).toHaveBeenCalledOnce();
    });
  });
});
