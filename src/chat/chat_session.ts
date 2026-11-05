import { randomUUID } from "node:crypto";

import { defaultChatTitle, isDefaultChatTitle } from "../i18n";
import { ToolRound } from "../tools/tool_round";
import {
	ChatMessage,
	cloneChatMessage,
	createChatMessage,
} from "./chat_message";
import type { ChatRole } from "./chat_role";

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
		throw new Error("Title cannot be empty");
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
 * @param id - The ID of the chat session.
 * @param messages - An array of chat messages.
 * @returns A chat session created from the legacy data.
 */
export function createChatSessionFromLegacy(
	id: string,
	messages: ChatMessage[],
): ChatSession {
	const now = new Date().toISOString();

	if (!id || !messages || !Array.isArray(messages)) {
		throw new Error("Invalid input");
	}

	return {
		id,
		title: createChatTitleFromMessages(messages),
		createdAt: messages[0]?.createdAt ?? now,
		updatedAt: messages[messages.length - 1]?.createdAt ?? now,
		messages: messages.map(cloneChatMessage),
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

	if (role === "user" && isDefaultChatTitle(session.title)) {
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
 * Normalizes a chat session by ensuring all properties are valid.
 * @param session - The chat session to normalize.
 * @returns A normalized chat session.
 */
export function normalizeChatSession(session: ChatSession): ChatSession {
	const title = session.title?.trim();
	const trashedAt =
		typeof session.trashedAt === "string" ? session.trashedAt : undefined;

	return {
		id: session.id || randomUUID(),
		// Every default title ever used ("New chat", "New conversation", "Nouvelle conversation") becomes the one of the
		// display language; a title the user chose is kept as it is.
		title: !title || isDefaultChatTitle(title) ? defaultChatTitle() : title,
		createdAt: session.createdAt || new Date().toISOString(),
		updatedAt:
			session.updatedAt || session.createdAt || new Date().toISOString(),
		archivedAt:
			typeof session.archivedAt === "string" ? session.archivedAt : undefined,
		trashedAt,
		messages: Array.isArray(session.messages)
			? session.messages.map(cloneChatMessage)
			: [],
	};
}

/**
 * Creates a chat title from an array of messages.
 * @param messages - An array of chat messages.
 * @returns A chat title based on the first user message.
 */
function createChatTitleFromMessages(messages: ChatMessage[]): string {
	const firstUserMessage = messages.find(
		(message) => message.role === "user",
	)?.content;

	return createChatTitleFromMessage(firstUserMessage ?? "");
}

/**
 * Creates a chat title from a single message.
 * @param message - The content of the message.
 * @returns A chat title based on the message content.
 */
function createChatTitleFromMessage(message: string): string {
	const clean = message.trim().replace(/\s+/g, " ");

	if (!clean) {
		return defaultChatTitle();
	}

	return clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
}
