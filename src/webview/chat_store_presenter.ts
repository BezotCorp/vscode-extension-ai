import * as vscode from "vscode";

import { ChatManager } from "../chat/chat_manager";
import { displayContent } from "./tool_call_presenter";

export function sendChatStore(
	webviewView: vscode.WebviewView,
	chatManager: ChatManager,
): void {
	const store = chatManager.getStore();
	const activeSession = chatManager.getActiveSession();

	webviewView.webview.postMessage({
		type: "chatStoreRestored",
		activeSessionId: store.activeSessionId,
		sessions: store.sessions.map((session) => ({
			id: session.id,
			title: session.title,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			archivedAt: session.archivedAt,
			trashedAt: session.trashedAt,
			messageCount: session.messages.length,
		})),
		messages: (activeSession?.messages ?? []).map((message) => ({
			role: message.role,
			content: displayContent(message),
			createdAt: message.createdAt,
		})),
	});
}
