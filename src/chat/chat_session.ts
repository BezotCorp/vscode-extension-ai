import { randomUUID } from 'node:crypto';

import { defaultChatTitle, isDefaultChatTitle } from '../i18n';
import type { ToolRound } from '../tools/tool_round';
import { type ChatMessage, cloneChatMessage, createChatMessage } from './chat_message';
import type { ChatRole } from './chat_role';

/**
 * Represents a chat session.
 */
export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  trashedAt?: string;
  messages: ChatMessage[];
};

/**
 * Creates a new chat session with an optional title.
 * @param title - The title of the chat session. Defaults to the "new conversation" title in the display language.
 * @returns A new chat session.
 */
export function createChatSession(title = defaultChatTitle()): ChatSession {
  const now = new Date().toISOString();

  if (!title) {
    throw new Error('Title cannot be empty');
  }

  return {
    id: randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

/**
 * Creates a chat session from legacy data.
 * Invalid messages are discarded while recoverable messages are normalized.
 * @param id - The ID of the chat session.
 * @param messages - The legacy chat message data.
 * @returns A chat session created from the legacy data.
 */
export function createChatSessionFromLegacy(id: string, messages: unknown): ChatSession {
  const now = new Date().toISOString();

  if (!id || !Array.isArray(messages)) {
    throw new Error('Invalid input');
  }

  const normalizedMessages = normalizeChatMessages(messages);

  return {
    id,
    title: createChatTitleFromMessages(normalizedMessages),
    createdAt: normalizedMessages[0]?.createdAt ?? now,
    updatedAt: normalizedMessages[normalizedMessages.length - 1]?.createdAt ?? now,
    messages: normalizedMessages,
  };
}

/**
 * Clones a chat session.
 * @param session - The chat session to clone.
 * @returns A cloned chat session.
 */
export function cloneChatSession(session: ChatSession): ChatSession {
  return {
    ...session,
    messages: session.messages.map(cloneChatMessage),
  };
}

/**
 * Adds a message to a chat session and updates the title if necessary.
 * @param session - The chat session.
 * @param role - The role of the message (e.g., 'user', 'assistant').
 * @param content - The content of the message.
 * @param toolRounds - Tool calls made while producing the message, if any.
 */
export function addMessageToChatSession(
  session: ChatSession,
  role: ChatRole,
  content: string,
  toolRounds?: ToolRound[],
): void {
  const message = createChatMessage(role, content, toolRounds);

  session.messages.push(message);
  session.updatedAt = message.createdAt;

  if (role === 'user' && isDefaultChatTitle(session.title)) {
    session.title = createChatTitleFromMessage(content);
  }
}

/**
 * Clears all messages and resets the title of a chat session.
 * @param session - The chat session to clear.
 */
export function clearChatSession(session: ChatSession): void {
  session.title = defaultChatTitle();
  session.messages = [];
  session.updatedAt = new Date().toISOString();
}

/**
 * Renames a chat session if the new title is not empty.
 * @param session - The chat session.
 * @param title - The new title of the chat session.
 */
export function renameChatSession(session: ChatSession, title: string): void {
  const cleanTitle = title.trim();

  if (!cleanTitle) {
    return;
  }

  session.title = cleanTitle;
  session.updatedAt = new Date().toISOString();
}

/**
 * Normalizes unknown chat session data into a valid chat session.
 *
 * Persisted data is external input: it may come from an older version,
 * a partially written file, manual modification, or otherwise malformed data.
 * Recoverable values are preserved and invalid values receive safe defaults.
 *
 * @param session - The chat session data to normalize.
 * @returns A valid normalized chat session.
 */
export function normalizeChatSession(session: unknown): ChatSession {
  const candidate = toRecord(session) ?? {};
  const now = new Date().toISOString();

  const id = nonEmptyString(candidate.id) ?? randomUUID();
  const rawTitle = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  const createdAt = normalizeDate(candidate.createdAt) ?? now;
  const updatedAt = normalizeDate(candidate.updatedAt) ?? createdAt;

  return {
    id,
    // Every default title ever used ("New chat", "New conversation", "Nouvelle conversation") becomes the one of the
    // display language; a title the user chose is kept as it is.
    title: !rawTitle || isDefaultChatTitle(rawTitle) ? defaultChatTitle() : rawTitle,
    createdAt,
    updatedAt,
    archivedAt: normalizeDate(candidate.archivedAt),
    trashedAt: normalizeDate(candidate.trashedAt),
    messages: normalizeChatMessages(candidate.messages),
  };
}

/**
 * Normalizes unknown message data.
 *
 * A message without a valid role or textual content cannot be recovered
 * meaningfully and is discarded. Missing timestamps can safely receive the
 * normalization time.
 */
function normalizeChatMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const normalized: ChatMessage[] = [];

  for (const message of messages) {
    const candidate = normalizeChatMessage(message);

    if (candidate) {
      normalized.push(candidate);
    }
  }

  return normalized;
}

function normalizeChatMessage(message: unknown): ChatMessage | undefined {
  const candidate = toRecord(message);

  if (!candidate || !isChatRole(candidate.role) || typeof candidate.content !== 'string') {
    return undefined;
  }

  const toolRounds = normalizeToolRounds(candidate.toolRounds);

  return {
    role: candidate.role,
    content: candidate.content,
    createdAt: normalizeDate(candidate.createdAt) ?? new Date().toISOString(),
    ...(toolRounds && { toolRounds }),
  };
}

/**
 * Keeps only structurally valid tool rounds from persisted message data.
 */
function normalizeToolRounds(toolRounds: unknown): ToolRound[] | undefined {
  if (!Array.isArray(toolRounds)) {
    return undefined;
  }

  const normalized: ToolRound[] = [];

  for (const toolRound of toolRounds) {
    const candidate = normalizeToolRound(toolRound);

    if (candidate) {
      normalized.push(candidate);
    }
  }

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeToolRound(toolRound: unknown): ToolRound | undefined {
  const candidate = toRecord(toolRound);

  if (!candidate || typeof candidate.content !== 'string' || !Array.isArray(candidate.calls)) {
    return undefined;
  }

  const calls: ToolRound['calls'] = [];

  for (const call of candidate.calls) {
    const normalizedCall = normalizeToolCall(call);

    if (normalizedCall) {
      calls.push(normalizedCall);
    }
  }

  return {
    content: candidate.content,
    calls,
  };
}

function normalizeToolCall(call: unknown): ToolRound['calls'][number] | undefined {
  const candidate = toRecord(call);

  if (!candidate || typeof candidate.name !== 'string' || typeof candidate.result !== 'string') {
    return undefined;
  }

  return {
    name: candidate.name,
    arguments: candidate.arguments,
    result: candidate.result,
  };
}

function isChatRole(value: unknown): value is ChatRole {
  return value === 'user' || value === 'assistant';
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const clean = value.trim();

  return clean.length > 0 ? clean : undefined;
}

function normalizeDate(value: unknown): string | undefined {
  let date: Date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else {
    return undefined;
  }

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

/**
 * Creates a chat title from an array of messages.
 * @param messages - An array of chat messages.
 * @returns A chat title based on the first user message.
 */
function createChatTitleFromMessages(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content;

  return createChatTitleFromMessage(firstUserMessage ?? '');
}

/**
 * Creates a chat title from a single message.
 * @param message - The content of the message.
 * @returns A chat title based on the message content.
 */
function createChatTitleFromMessage(message: string): string {
  const clean = message.trim().replace(/\s+/g, ' ');

  if (!clean) {
    return defaultChatTitle();
  }

  return clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
}
