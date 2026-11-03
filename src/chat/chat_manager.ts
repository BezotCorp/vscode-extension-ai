import { ToolRound } from '../tools/tool_round';
import { ChatMessage } from './chat_message';
import type { ChatRole } from './chat_role';
import { addMessageToChatSession, ChatSession, cloneChatSession } from './chat_session';
import {
  ChatStore,
  clearActiveChatSession,
  cloneChatStore,
  createAndActivateChatSession,
  createChatStore,
  deleteChatSessionById,
  getActiveChatSession,
  normalizeChatStore,
  renameChatSessionById,
  setActiveChatSession,
} from './chat_store';
import { ChatStorage } from './chat_storage';

export class ChatManager {
  private store: ChatStore = createChatStore();

  constructor(private readonly storage: ChatStorage) {}

  async load(): Promise<void> {
    const stored = await this.storage.load();
    this.store = stored ? normalizeChatStore(stored) : createChatStore();
  }

  getStore(): ChatStore {
    return cloneChatStore(this.store);
  }

  getSessions(): ChatSession[] {
    return this.store.sessions.map(cloneChatSession);
  }

  getActiveSession(): ChatSession | undefined {
    return getActiveChatSession(this.store);
  }

  getMessages(): ChatMessage[] {
    const activeSession = getActiveChatSession(this.store);
    return activeSession ? [...activeSession.messages] : [];
  }

  async createSession(title?: string): Promise<ChatSession> {
    const session = createAndActivateChatSession(this.store, title);
    await this.persist();
    return cloneChatSession(session);
  }

  async setActiveSession(sessionId: string): Promise<ChatSession | undefined> {
    const session = setActiveChatSession(this.store, sessionId);
    if (!session) return undefined;
    await this.persist();
    return cloneChatSession(session);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    renameChatSessionById(this.store, sessionId, title);
    await this.persist();
  }

  async deleteSession(sessionId: string): Promise<void> {
    deleteChatSessionById(this.store, sessionId);
    await this.persist();
  }

  async addMessage(role: ChatRole, content: string, toolRounds?: ToolRound[]): Promise<void> {
    const activeSession = getActiveChatSession(this.store);
    if (activeSession) {
      addMessageToChatSession(activeSession, role, content, toolRounds);
      await this.persist();
    }
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
