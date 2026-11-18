import type { ToolRound } from '../tools/tool_round';
import type { ChatRole } from './chat_role';
import { addMessageToChatSession, type ChatSession, cloneChatSession } from './chat_session';
import type { ChatStorage } from './chat_storage';
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
} from './chat_store';

export class ChatManager {
  private store: ChatStore = createChatStore();

  constructor(private readonly storage: ChatStorage) {}

  async load(): Promise<void> {
    const stored = await this.storage.load();

    this.store = stored ? normalizeChatStore(stored) : createChatStore();

    activateMostRecentNonEmptyChatSession(this.store);
  }

  getStore(): ChatStore {
    return cloneChatStore(this.store);
  }

  getActiveSession(): ChatSession | undefined {
    return getActiveChatSession(this.store);
  }

  async createSession(title?: string): Promise<ChatSession> {
    const session = createAndActivateChatSession(this.store, title);

    await this.persist();

    return cloneChatSession(session);
  }

  async setActiveSession(sessionId: string): Promise<ChatSession | undefined> {
    const session = setActiveChatSession(this.store, sessionId);

    if (!session) {
      return undefined;
    }

    await this.persist();

    return cloneChatSession(session);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    renameChatSessionById(this.store, sessionId, title);
    await this.persist();
  }

  async archiveSession(sessionId: string): Promise<void> {
    archiveChatSessionById(this.store, sessionId);
    await this.persist();
  }

  async restoreArchivedSession(sessionId: string): Promise<void> {
    restoreArchivedChatSessionById(this.store, sessionId);

    await this.persist();
  }

  async trashSession(sessionId: string): Promise<void> {
    trashChatSessionById(this.store, sessionId);
    await this.persist();
  }

  async restoreTrashedSession(sessionId: string): Promise<void> {
    restoreTrashedChatSessionById(this.store, sessionId);

    await this.persist();
  }

  async trashArchivedSessions(): Promise<void> {
    trashArchivedChatSessions(this.store);
    await this.persist();
  }

  async deleteTrashedSession(sessionId: string): Promise<void> {
    deleteTrashedChatSessionById(this.store, sessionId);
    await this.persist();
  }

  async emptyTrash(): Promise<void> {
    emptyTrashedChatSessions(this.store);
    await this.persist();
  }

  async addMessageToSession(
    sessionId: string,
    role: ChatRole,
    content: string,
    toolRounds?: ToolRound[],
  ): Promise<boolean> {
    const session = this.store.sessions.find((candidate) => candidate.id === sessionId);

    if (!session) {
      return false;
    }

    addMessageToChatSession(session, role, content, toolRounds);

    await this.persist();
    return true;
  }

  async clearActiveSession(): Promise<void> {
    clearActiveChatSession(this.store);
    await this.persist();
  }

  private async persist(): Promise<void> {
    this.store = normalizeChatStore(this.store);
    await this.storage.save(this.store);
  }
}
