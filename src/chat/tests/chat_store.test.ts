import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n', () => ({
	defaultChatTitle: () => 'New conversation',
	isDefaultChatTitle: (title: string) => ['New chat', 'New conversation', 'Nouvelle conversation'].includes(title),
}));

import { CHAT_STORE_VERSION } from '../chat_storage_constants';
import {
	activateMostRecentNonEmptyChatSession,
	archiveChatSessionById,
	type ChatStore,
	clearActiveChatSession,
	cloneChatStore,
	createAndActivateChatSession,
	createChatStore,
	deleteTrashedChatSessionById,
	emptyTrashedChatSessions,
	getActiveChatSession,
	normalizeChatStore,
	renameChatSessionById,
	restoreArchivedChatSessionById,
	restoreTrashedChatSessionById,
	setActiveChatSession,
	trashArchivedChatSessions,
	trashChatSessionById,
} from '../chat_store';

type Session = ChatStore['sessions'][number];

function addUserMessage(session: Session, content = 'Hello', createdAt = '2026-11-06T10:00:00.000Z'): void {
	session.messages.push({
		role: 'user',
		content,
		createdAt,
	});
	session.updatedAt = createdAt;
}

describe('chat_store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('createChatStore', () => {
		it('creates a store with one active empty session', () => {
			const store = createChatStore();

			expect(store.version).toBe(CHAT_STORE_VERSION);
			expect(store.sessions).toHaveLength(1);
			expect(store.activeSessionId).toBe(store.sessions[0]?.id);
			expect(store.sessions[0]?.messages).toEqual([]);
			expect(store.sessions[0]?.archivedAt).toBeUndefined();
			expect(store.sessions[0]?.trashedAt).toBeUndefined();
		});
	});

	describe('cloneChatStore', () => {
		it('creates a distinct copy of the store, sessions and messages', () => {
			const store = createChatStore();

			addUserMessage(store.sessions[0]);

			const clone = cloneChatStore(store);

			expect(clone).toEqual(store);
			expect(clone).not.toBe(store);
			expect(clone.sessions).not.toBe(store.sessions);
			expect(clone.sessions[0]).not.toBe(store.sessions[0]);
			expect(clone.sessions[0]?.messages).not.toBe(store.sessions[0]?.messages);
			expect(clone.sessions[0]?.messages[0]).not.toBe(store.sessions[0]?.messages[0]);
		});

		it('does not mutate the original when the cloned session is modified', () => {
			const store = createChatStore();
			const clone = cloneChatStore(store);

			clone.sessions[0].title = 'Modified title';

			expect(store.sessions[0].title).toBe('New conversation');
		});
	});

	describe('normalizeChatStore', () => {
		it('normalizes a non-string session title', () => {
			const corruptedStore = {
				version: CHAT_STORE_VERSION,
				activeSessionId: 'session-id',
				sessions: [
					{
						id: 'session-id',
						title: 123,
						createdAt: '2026-11-06T10:00:00.000Z',
						updatedAt: '2026-11-06T10:00:00.000Z',
						messages: [],
					},
				],
			};

			const normalized = normalizeChatStore(corruptedStore as unknown as ChatStore);

			expect(normalized.sessions[0]?.title).toBe('New conversation');
		});

		it('creates a new session when the store has no sessions', () => {
			const store = {
				version: CHAT_STORE_VERSION,
				activeSessionId: 'missing',
				sessions: [],
			} satisfies ChatStore;

			const normalized = normalizeChatStore(store);

			expect(normalized.sessions).toHaveLength(1);
			expect(normalized.activeSessionId).toBe(normalized.sessions[0]?.id);
		});

		it('creates a new session when sessions is not an array', () => {
			const corruptedStore = {
				version: CHAT_STORE_VERSION,
				activeSessionId: 'missing',
				sessions: 'definitely-not-sessions',
			};

			const normalized = normalizeChatStore(corruptedStore as unknown as ChatStore);

			expect(normalized.sessions).toHaveLength(1);
			expect(normalized.activeSessionId).toBe(normalized.sessions[0]?.id);
		});

		it('preserves a valid active session id', () => {
			const store = createChatStore();
			const originalId = store.activeSessionId;

			const normalized = normalizeChatStore(store);

			expect(normalized.activeSessionId).toBe(originalId);
		});

		it('selects the first active session when activeSessionId is invalid', () => {
			const store = createChatStore();

			addUserMessage(store.sessions[0]);

			const second = createAndActivateChatSession(store);

			store.activeSessionId = 'missing';

			const normalized = normalizeChatStore(store);

			expect(normalized.activeSessionId).toBe(second.id);
		});

		it('creates an active session when every existing session is archived', () => {
			const store = createChatStore();
			const archivedId = store.sessions[0].id;

			store.sessions[0].archivedAt = '2026-11-06T09:00:00.000Z';

			const normalized = normalizeChatStore(store);

			expect(normalized.sessions).toHaveLength(2);
			expect(normalized.activeSessionId).not.toBe(archivedId);

			const active = normalized.sessions.find((session) => session.id === normalized.activeSessionId);

			expect(active?.archivedAt).toBeUndefined();
			expect(active?.trashedAt).toBeUndefined();
		});

		it('creates an active session when every existing session is trashed', () => {
			const store = createChatStore();
			const trashedId = store.sessions[0].id;

			store.sessions[0].trashedAt = '2026-11-06T09:00:00.000Z';

			const normalized = normalizeChatStore(store);

			expect(normalized.sessions).toHaveLength(2);
			expect(normalized.activeSessionId).not.toBe(trashedId);
		});
	});

	describe('getActiveChatSession', () => {
		it('returns the current active session', () => {
			const store = createChatStore();

			const session = getActiveChatSession(store);

			expect(session).toBe(store.sessions[0]);
		});

		it('falls back to an existing active session when activeSessionId is invalid', () => {
			const store = createChatStore();
			const expected = store.sessions[0];

			store.activeSessionId = 'missing';

			const session = getActiveChatSession(store);

			expect(session).toBe(expected);
			expect(store.activeSessionId).toBe(expected.id);
		});

		it('creates a session when no active session exists', () => {
			const store = createChatStore();

			store.sessions[0].archivedAt = '2026-11-06T09:00:00.000Z';
			store.activeSessionId = store.sessions[0].id;

			const session = getActiveChatSession(store);

			expect(session).toBeDefined();
			expect(session?.id).not.toBe(store.sessions[1]?.id);
			expect(session?.archivedAt).toBeUndefined();
			expect(session?.trashedAt).toBeUndefined();
			expect(store.activeSessionId).toBe(session?.id);
			expect(store.sessions).toHaveLength(2);
		});
	});

	describe('createAndActivateChatSession', () => {
		it('reuses the active empty session', () => {
			const store = createChatStore();
			const original = store.sessions[0];

			const session = createAndActivateChatSession(store);

			expect(session).toBe(original);
			expect(store.sessions).toHaveLength(1);
			expect(store.activeSessionId).toBe(original.id);
		});

		it('reuses another empty active session when the current session is not empty', () => {
			const store = createChatStore();

			addUserMessage(store.sessions[0]);

			const emptySession: Session = {
				id: 'existing-empty',
				title: 'Existing empty',
				createdAt: '2026-11-06T09:00:00.000Z',
				updatedAt: '2026-11-06T09:00:00.000Z',
				messages: [],
			};

			store.sessions.push(emptySession);

			const session = createAndActivateChatSession(store);

			expect(session).toBe(emptySession);
			expect(store.sessions).toHaveLength(2);
			expect(store.activeSessionId).toBe(emptySession.id);
		});

		it('creates a new session when no reusable empty session exists', () => {
			const store = createChatStore();
			const first = store.sessions[0];

			addUserMessage(first);

			const second = createAndActivateChatSession(store);

			expect(second).not.toBe(first);
			expect(store.sessions).toHaveLength(2);
			expect(store.sessions[0]).toBe(second);
			expect(store.activeSessionId).toBe(second.id);
			expect(second.messages).toEqual([]);
		});
	});

	describe('activateMostRecentNonEmptyChatSession', () => {
		it('keeps the active session when it already contains messages', () => {
			const store = createChatStore();

			addUserMessage(store.sessions[0]);

			const activeId = store.activeSessionId;
			const session = activateMostRecentNonEmptyChatSession(store);

			expect(session?.id).toBe(activeId);
			expect(store.activeSessionId).toBe(activeId);
		});

		it('activates the most recently updated non-empty session when the active one is empty', () => {
			const store = createChatStore();
			const first = store.sessions[0];

			addUserMessage(first, 'First', '2026-11-06T08:00:00.000Z');

			const activeEmpty = createAndActivateChatSession(store);

			const newer: Session = {
				id: 'newer-session',
				title: 'Newer',
				createdAt: '2026-11-06T08:30:00.000Z',
				updatedAt: '2026-11-06T09:30:00.000Z',
				messages: [
					{
						role: 'user',
						content: 'Newer message',
						createdAt: '2026-11-06T09:30:00.000Z',
					},
				],
			};

			store.sessions.push(newer);
			store.activeSessionId = activeEmpty.id;

			const session = activateMostRecentNonEmptyChatSession(store);

			expect(session).toBe(newer);
			expect(store.activeSessionId).toBe(newer.id);
		});

		it('keeps the active empty session when no non-empty session exists', () => {
			const store = createChatStore();
			const active = store.sessions[0];

			const session = activateMostRecentNonEmptyChatSession(store);

			expect(session).toBe(active);
			expect(store.activeSessionId).toBe(active.id);
		});
	});

	describe('setActiveChatSession', () => {
		it('activates an existing active session', () => {
			const store = createChatStore();

			addUserMessage(store.sessions[0]);

			const second = createAndActivateChatSession(store);
			const first = store.sessions.find((session) => session.id !== second.id);

			const selected = setActiveChatSession(store, first?.id ?? '');

			expect(selected).toBe(first);
			expect(store.activeSessionId).toBe(first?.id);
		});

		it('does nothing for an unknown session id', () => {
			const store = createChatStore();
			const activeId = store.activeSessionId;

			const selected = setActiveChatSession(store, 'missing');

			expect(selected).toBeUndefined();
			expect(store.activeSessionId).toBe(activeId);
		});

		it('does not activate an archived session', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.archivedAt = '2026-11-06T09:00:00.000Z';

			const selected = setActiveChatSession(store, session.id);

			expect(selected).toBeUndefined();
		});

		it('does not activate a trashed session', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.trashedAt = '2026-11-06T09:00:00.000Z';

			const selected = setActiveChatSession(store, session.id);

			expect(selected).toBeUndefined();
		});
	});

	describe('renameChatSessionById', () => {
		it('renames an active session', () => {
			const store = createChatStore();

			renameChatSessionById(store, store.activeSessionId, '  Renamed  ');

			expect(store.sessions[0].title).toBe('Renamed');
		});

		it('does not rename an archived session', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.archivedAt = '2026-11-06T09:00:00.000Z';

			renameChatSessionById(store, session.id, 'Renamed');

			expect(session.title).toBe('New conversation');
		});

		it('does nothing for an unknown session', () => {
			const store = createChatStore();

			expect(() => renameChatSessionById(store, 'missing', 'Renamed')).not.toThrow();
		});
	});

	describe('archiveChatSessionById', () => {
		it('archives a session and updates its timestamp', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			addUserMessage(session);

			const replacement = createAndActivateChatSession(store);

			vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

			archiveChatSessionById(store, session.id);

			expect(session.archivedAt).toBe('2026-11-06T11:00:00.000Z');
			expect(session.updatedAt).toBe('2026-11-06T11:00:00.000Z');
			expect(store.activeSessionId).toBe(replacement.id);
		});

		it('switches away when the active session is archived', () => {
			const store = createChatStore();
			const first = store.sessions[0];

			addUserMessage(first);

			const second = createAndActivateChatSession(store);

			archiveChatSessionById(store, second.id);

			expect(second.archivedAt).toBeDefined();
			expect(store.activeSessionId).toBe(first.id);
		});

		it('creates a replacement when the last active session is archived', () => {
			const store = createChatStore();
			const original = store.sessions[0];

			archiveChatSessionById(store, original.id);

			expect(original.archivedAt).toBeDefined();
			expect(store.sessions).toHaveLength(2);
			expect(store.activeSessionId).not.toBe(original.id);
		});

		it('does nothing for an unknown session', () => {
			const store = createChatStore();

			expect(() => archiveChatSessionById(store, 'missing')).not.toThrow();
		});
	});

	describe('restoreArchivedChatSessionById', () => {
		it('restores an archived session', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.archivedAt = '2026-11-06T09:00:00.000Z';

			vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

			restoreArchivedChatSessionById(store, session.id);

			expect(session.archivedAt).toBeUndefined();
			expect(session.updatedAt).toBe('2026-11-06T11:00:00.000Z');
		});

		it('does not restore an archived session that is also trashed', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.archivedAt = '2026-11-06T08:00:00.000Z';
			session.trashedAt = '2026-11-06T09:00:00.000Z';

			restoreArchivedChatSessionById(store, session.id);

			expect(session.archivedAt).toBe('2026-11-06T08:00:00.000Z');
		});

		it('does nothing for a non-archived session', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			restoreArchivedChatSessionById(store, session.id);

			expect(session.archivedAt).toBeUndefined();
		});
	});

	describe('trashChatSessionById', () => {
		it('moves a session to the trash', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

			trashChatSessionById(store, session.id);

			expect(session.trashedAt).toBe('2026-11-06T11:00:00.000Z');
			expect(session.updatedAt).toBe('2026-11-06T11:00:00.000Z');
		});

		it('creates another active session when the only active session is trashed', () => {
			const store = createChatStore();
			const original = store.sessions[0];

			trashChatSessionById(store, original.id);

			expect(original.trashedAt).toBeDefined();
			expect(store.sessions).toHaveLength(2);
			expect(store.activeSessionId).not.toBe(original.id);
		});

		it('does not trash an already trashed session again', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.trashedAt = '2026-11-06T08:00:00.000Z';

			trashChatSessionById(store, session.id);

			expect(session.trashedAt).toBe('2026-11-06T08:00:00.000Z');
		});

		it('does nothing for an unknown session', () => {
			const store = createChatStore();

			expect(() => trashChatSessionById(store, 'missing')).not.toThrow();
		});
	});

	describe('restoreTrashedChatSessionById', () => {
		it('restores a trashed session', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.trashedAt = '2026-11-06T09:00:00.000Z';

			vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

			restoreTrashedChatSessionById(store, session.id);

			expect(session.trashedAt).toBeUndefined();
			expect(session.updatedAt).toBe('2026-11-06T11:00:00.000Z');
		});

		it('does nothing for a session that is not trashed', () => {
			const store = createChatStore();
			const session = store.sessions[0];
			const updatedAt = session.updatedAt;

			restoreTrashedChatSessionById(store, session.id);

			expect(session.trashedAt).toBeUndefined();
			expect(session.updatedAt).toBe(updatedAt);
		});
	});

	describe('trashArchivedChatSessions', () => {
		it('trashes every archived session that is not already trashed', () => {
			const store = createChatStore();
			const first = store.sessions[0];

			addUserMessage(first);

			const active = createAndActivateChatSession(store);

			first.archivedAt = '2026-11-06T08:00:00.000Z';

			const alreadyTrashed: Session = {
				id: 'already-trashed',
				title: 'Already trashed',
				createdAt: '2026-11-06T07:00:00.000Z',
				updatedAt: '2026-11-06T09:00:00.000Z',
				archivedAt: '2026-11-06T08:00:00.000Z',
				trashedAt: '2026-11-06T09:00:00.000Z',
				messages: [],
			};

			store.sessions.push(alreadyTrashed);

			vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

			trashArchivedChatSessions(store);

			expect(first.trashedAt).toBe('2026-11-06T11:00:00.000Z');
			expect(first.updatedAt).toBe('2026-11-06T11:00:00.000Z');
			expect(alreadyTrashed.trashedAt).toBe('2026-11-06T09:00:00.000Z');
			expect(active.trashedAt).toBeUndefined();
		});
	});

	describe('deleteTrashedChatSessionById', () => {
		it('permanently deletes a trashed session', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			addUserMessage(session);

			const active = createAndActivateChatSession(store);

			session.trashedAt = '2026-11-06T09:00:00.000Z';

			deleteTrashedChatSessionById(store, session.id);

			expect(store.sessions.some((candidate) => candidate.id === session.id)).toBe(false);
			expect(store.activeSessionId).toBe(active.id);
		});

		it('does not delete a session that is not trashed', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			deleteTrashedChatSessionById(store, session.id);

			expect(store.sessions).toContain(session);
		});

		it('creates an active session if deletion leaves no active session', () => {
			const trashed: Session = {
				id: 'trashed',
				title: 'Trashed',
				createdAt: '2026-11-06T08:00:00.000Z',
				updatedAt: '2026-11-06T09:00:00.000Z',
				trashedAt: '2026-11-06T09:00:00.000Z',
				messages: [],
			};

			const store: ChatStore = {
				version: CHAT_STORE_VERSION,
				activeSessionId: trashed.id,
				sessions: [trashed],
			};

			deleteTrashedChatSessionById(store, trashed.id);

			expect(store.sessions).toHaveLength(1);
			expect(store.sessions[0]?.id).not.toBe(trashed.id);
			expect(store.activeSessionId).toBe(store.sessions[0]?.id);
		});
	});

	describe('emptyTrashedChatSessions', () => {
		it('removes every trashed session and preserves active sessions', () => {
			const store = createChatStore();
			const active = store.sessions[0];

			const trashed1: Session = {
				id: 'trashed-1',
				title: 'Trashed 1',
				createdAt: '2026-11-06T08:00:00.000Z',
				updatedAt: '2026-11-06T09:00:00.000Z',
				trashedAt: '2026-11-06T09:00:00.000Z',
				messages: [],
			};

			const trashed2: Session = {
				...trashed1,
				id: 'trashed-2',
				title: 'Trashed 2',
			};

			store.sessions.push(trashed1, trashed2);

			emptyTrashedChatSessions(store);

			expect(store.sessions).toEqual([active]);
			expect(store.activeSessionId).toBe(active.id);
		});

		it('creates an active session when emptying the trash leaves none', () => {
			const trashed: Session = {
				id: 'trashed',
				title: 'Trashed',
				createdAt: '2026-11-06T08:00:00.000Z',
				updatedAt: '2026-11-06T09:00:00.000Z',
				trashedAt: '2026-11-06T09:00:00.000Z',
				messages: [],
			};

			const store: ChatStore = {
				version: CHAT_STORE_VERSION,
				activeSessionId: trashed.id,
				sessions: [trashed],
			};

			emptyTrashedChatSessions(store);

			expect(store.sessions).toHaveLength(1);
			expect(store.sessions[0]?.id).not.toBe(trashed.id);
			expect(store.activeSessionId).toBe(store.sessions[0]?.id);
		});
	});

	describe('clearActiveChatSession', () => {
		it('clears the active session and resets its title', () => {
			const store = createChatStore();
			const session = store.sessions[0];

			session.title = 'Custom title';
			addUserMessage(session);

			vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));

			clearActiveChatSession(store);

			expect(session.title).toBe('New conversation');
			expect(session.messages).toEqual([]);
			expect(session.updatedAt).toBe('2026-11-06T11:00:00.000Z');
		});

		it('creates and clears a session when the store has no active session', () => {
			const archived: Session = {
				id: 'archived',
				title: 'Archived',
				createdAt: '2026-11-06T08:00:00.000Z',
				updatedAt: '2026-11-06T09:00:00.000Z',
				archivedAt: '2026-11-06T09:00:00.000Z',
				messages: [],
			};

			const store: ChatStore = {
				version: CHAT_STORE_VERSION,
				activeSessionId: archived.id,
				sessions: [archived],
			};

			clearActiveChatSession(store);

			expect(store.sessions).toHaveLength(2);

			const active = store.sessions.find((session) => session.id === store.activeSessionId);

			expect(active).toBeDefined();
			expect(active?.title).toBe('New conversation');
			expect(active?.messages).toEqual([]);
		});
	});
});
