import {
	type ChatSession,
	clearChatSession,
	cloneChatSession,
	createChatSession,
	normalizeChatSession,
	renameChatSession,
} from './chat_session';

export const CHAT_STORE_VERSION = 1;

export type ChatStore = {
	version: typeof CHAT_STORE_VERSION;
	activeSessionId: string;
	sessions: ChatSession[];
};

export function createChatStore(): ChatStore {
	const session = createChatSession();

	return {
		version: CHAT_STORE_VERSION,
		activeSessionId: session.id,
		sessions: [session],
	};
}

export function cloneChatStore(store: ChatStore): ChatStore {
	return {
		version: CHAT_STORE_VERSION,
		activeSessionId: store.activeSessionId,
		sessions: store.sessions.map(cloneChatSession),
	};
}

export function normalizeChatStore(store: ChatStore): ChatStore {
	if (!Array.isArray(store.sessions) || store.sessions.length === 0) {
		return createChatStore();
	}

	const sessions = store.sessions.map(normalizeChatSession);
	const activeSessions = sessions.filter(isActiveSession);

	if (activeSessions.length === 0) {
		const session = createChatSession();

		sessions.unshift(session);

		return {
			version: CHAT_STORE_VERSION,
			activeSessionId: session.id,
			sessions,
		};
	}

	const activeSessionExists = activeSessions.some((session) => session.id === store.activeSessionId);

	return {
		version: CHAT_STORE_VERSION,
		activeSessionId: activeSessionExists ? store.activeSessionId : activeSessions[0].id,
		sessions,
	};
}

export function getActiveChatSession(store: ChatStore): ChatSession | undefined {
	const session = store.sessions.find(
		(candidate) => candidate.id === store.activeSessionId && isActiveSession(candidate),
	);

	return session ?? ensureActiveChatSession(store);
}

export function createAndActivateChatSession(store: ChatStore, title?: string): ChatSession {
	const activeSession = store.sessions.find(
		(session) => session.id === store.activeSessionId && isActiveSession(session) && session.messages.length === 0,
	);

	if (activeSession) {
		return activeSession;
	}

	const emptySession = store.sessions.find((session) => isActiveSession(session) && session.messages.length === 0);

	if (emptySession) {
		store.activeSessionId = emptySession.id;
		return emptySession;
	}

	const session = createChatSession(title);

	store.sessions.unshift(session);
	store.activeSessionId = session.id;

	return session;
}

export function activateMostRecentNonEmptyChatSession(store: ChatStore): ChatSession | undefined {
	const activeSession = store.sessions.find(
		(session) => session.id === store.activeSessionId && isActiveSession(session),
	);

	if (activeSession && activeSession.messages.length > 0) {
		return activeSession;
	}

	const mostRecentSession = store.sessions
		.filter((session) => isActiveSession(session) && session.messages.length > 0)
		.slice()
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

	if (!mostRecentSession) {
		return activeSession;
	}

	store.activeSessionId = mostRecentSession.id;

	return mostRecentSession;
}

export function setActiveChatSession(store: ChatStore, sessionId: string): ChatSession | undefined {
	const session = store.sessions.find((candidate) => candidate.id === sessionId && isActiveSession(candidate));

	if (session) {
		store.activeSessionId = session.id;
	}

	return session;
}

export function renameChatSessionById(store: ChatStore, sessionId: string, title: string): void {
	const session = store.sessions.find((candidate) => candidate.id === sessionId && isActiveSession(candidate));

	if (session) {
		renameChatSession(session, title);
	}
}

export function archiveChatSessionById(store: ChatStore, sessionId: string): void {
	const session = store.sessions.find((candidate) => candidate.id === sessionId && isActiveSession(candidate));

	if (!session) {
		return;
	}

	session.archivedAt = new Date().toISOString();
	session.updatedAt = session.archivedAt;

	if (store.activeSessionId === sessionId) {
		activateFirstAvailableSession(store);
	}
}

export function restoreArchivedChatSessionById(store: ChatStore, sessionId: string): void {
	const session = store.sessions.find(
		(candidate) =>
			candidate.id === sessionId && candidate.archivedAt !== undefined && candidate.trashedAt === undefined,
	);

	if (!session) {
		return;
	}

	session.archivedAt = undefined;
	session.updatedAt = new Date().toISOString();
}

export function trashChatSessionById(store: ChatStore, sessionId: string): void {
	const session = store.sessions.find((candidate) => candidate.id === sessionId && candidate.trashedAt === undefined);

	if (!session) {
		return;
	}

	const now = new Date().toISOString();

	session.trashedAt = now;
	session.updatedAt = now;

	if (store.activeSessionId === sessionId) {
		activateFirstAvailableSession(store);
	}
}

export function restoreTrashedChatSessionById(store: ChatStore, sessionId: string): void {
	const session = store.sessions.find((candidate) => candidate.id === sessionId && candidate.trashedAt !== undefined);

	if (!session) {
		return;
	}

	session.trashedAt = undefined;
	session.updatedAt = new Date().toISOString();
}

export function trashArchivedChatSessions(store: ChatStore): void {
	const now = new Date().toISOString();

	for (const session of store.sessions) {
		if (session.archivedAt === undefined || session.trashedAt !== undefined) {
			continue;
		}

		session.trashedAt = now;
		session.updatedAt = now;
	}
}

export function deleteTrashedChatSessionById(store: ChatStore, sessionId: string): void {
	const session = store.sessions.find((candidate) => candidate.id === sessionId && candidate.trashedAt !== undefined);

	if (!session) {
		return;
	}

	store.sessions = store.sessions.filter((candidate) => candidate.id !== sessionId);

	if (!store.sessions.some(isActiveSession)) {
		activateFirstAvailableSession(store);
	}
}

export function emptyTrashedChatSessions(store: ChatStore): void {
	store.sessions = store.sessions.filter((session) => session.trashedAt === undefined);

	if (!store.sessions.some(isActiveSession)) {
		activateFirstAvailableSession(store);
	}
}

export function clearActiveChatSession(store: ChatStore): void {
	const session = ensureActiveChatSession(store);

	clearChatSession(session);
}

function ensureActiveChatSession(store: ChatStore): ChatSession {
	let session = store.sessions.find(
		(candidate) => candidate.id === store.activeSessionId && isActiveSession(candidate),
	);

	if (!session) {
		session = store.sessions.find(isActiveSession);
	}

	if (!session) {
		session = createChatSession();
		store.sessions.unshift(session);
	}

	store.activeSessionId = session.id;

	return session;
}

function activateFirstAvailableSession(store: ChatStore): void {
	const session = store.sessions.find(isActiveSession);

	if (session) {
		store.activeSessionId = session.id;
		return;
	}

	const created = createChatSession();

	store.sessions.unshift(created);
	store.activeSessionId = created.id;
}

function isActiveSession(session: ChatSession): boolean {
	return session.archivedAt === undefined && session.trashedAt === undefined;
}
