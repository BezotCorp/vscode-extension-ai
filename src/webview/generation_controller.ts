import * as vscode from "vscode";

import { ChatManager } from "../chat/chat_manager";
import { ChatMessage } from "../chat/chat_message";
import type { ChatRole } from "../chat/chat_role";
import { closingText } from "../chat/message_text";
import { getExtensionConfig } from "../config/extension_config";
import { buildAiContext } from "../context";
import { ChatHistoryMessage } from "../providers/ai_provider";
import { createProvider } from "../providers/provider_factory";
import { McpManager } from "../mcp";
import { PermissionStore } from "../permissions";
import {
	createDefaultToolRegistry,
	FileToolServices,
	ToolAccessGuard,
	ToolRegistry,
	ToolRound,
} from "../tools";
import { sendChatStore } from "./chat_store_presenter";
import {
	sendToolCall,
	sendToolNotice,
	sendToolResult,
} from "./tool_call_presenter";
import { t } from "../i18n";

const MAX_HISTORY_MESSAGES = 40;
// Used when the provider cannot say how large its context window is.
const DEFAULT_HISTORY_CHARACTERS = 24_000;
// Share of the context window earlier turns may take, and characters per token assumed (see OllamaProvider).
const HISTORY_CONTEXT_SHARE = 0.4;
const CHARS_PER_TOKEN = 3;
const MAX_STORED_RESULT_CHARACTERS = 4_000;

export class GenerationController {
	private currentAbortController: AbortController | undefined;
	private currentGeneration: Promise<void> | undefined;
	private currentGenerationSessionId: string | undefined;
	private readonly permissionStore: PermissionStore;

	constructor(
		private readonly chatManager: ChatManager,
		permissionStore: PermissionStore,
		private readonly mcpManager: McpManager,
		private readonly files: FileToolServices,
	) {
		this.permissionStore = permissionStore;
	}

	stopGeneration(): void {
		this.currentAbortController?.abort();
	}

	async stopGenerationForSessionAndWait(sessionId: string): Promise<void> {
		if (this.currentGenerationSessionId !== sessionId) {
			return;
		}

		const generation = this.currentGeneration;

		this.currentAbortController?.abort();

		if (generation) {
			await generation;
		}
	}

	private async createTools(
		accessGuard: ToolAccessGuard,
		signal: AbortSignal,
	): Promise<ToolRegistry> {
		const registry = createDefaultToolRegistry(accessGuard, this.files);

		if (accessGuard.mode !== "readOnly") {
			try {
				for (const tool of await this.mcpManager.createTools(
					accessGuard,
					signal,
				)) {
					const reason = accessGuard.unavailableReason(tool);

					if (reason) {
						registry.markUnavailable(tool, reason);
					} else {
						registry.register(tool);
					}
				}
			} catch (error) {
				// A broken MCP server must not take the built-in tools down with it.
				console.error(`BezotCorp AI: MCP tools unavailable: ${String(error)}`);
			}
		}

		return registry;
	}

	// The message is kept in memory even when it cannot be written to disk: the answer must not be lost with it.
	private async remember(
		sessionId: string,
		role: ChatRole,
		content: string,
		toolRounds?: ToolRound[],
	): Promise<boolean> {
		try {
			return await this.chatManager.addMessageToSession(
				sessionId,
				role,
				content,
				toolRounds,
			);
		} catch (error) {
			// The ChatManager mutates memory before persistence. A storage failure must not
			// make the generation forget a message that is still present in memory.
			void vscode.window.showWarningMessage(
				t("notify.error", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return true;
		}
	}

	async sendChatMessage(
		webviewView: vscode.WebviewView,
		text: string,
	): Promise<void> {
		const session = this.chatManager.getActiveSession();

		if (!session) {
			return;
		}

		const generation = this.runChatMessage(
			webviewView,
			text,
			session.id,
			session.messages,
		);

		this.currentGeneration = generation;
		this.currentGenerationSessionId = session.id;

		try {
			await generation;
		} finally {
			if (this.currentGeneration === generation) {
				this.currentGeneration = undefined;
				this.currentGenerationSessionId = undefined;
			}
		}
	}

	private async runChatMessage(
		webviewView: vscode.WebviewView,
		text: string,
		sessionId: string,
		sessionMessages: ChatMessage[],
	): Promise<void> {
		const config = getExtensionConfig();
		const provider = createProvider(config);
		const abortController = new AbortController();

		this.currentAbortController?.abort();
		this.currentAbortController = abortController;

		const accessGuard = new ToolAccessGuard(
			this.permissionStore,
			() => getExtensionConfig().autonomyMode,
		);
		let assistantText = "";
		const toolRounds: ToolRound[] = [];

		try {
			const context = await buildAiContext();

			const contextTokens = await provider.resolveContextTokens?.(
				abortController.signal,
			);
			const history = selectHistory(
				sessionMessages,
				contextTokens
					? Math.floor(contextTokens * CHARS_PER_TOKEN * HISTORY_CONTEXT_SHARE)
					: DEFAULT_HISTORY_CHARACTERS,
			);

			const userMessageRemembered = await this.remember(
				sessionId,
				"user",
				text,
			);

			if (!userMessageRemembered) {
				webviewView.webview.postMessage({
					type: "responseStopped",
					sessionId,
				});
				return;
			}

			sendChatStore(webviewView, this.chatManager);

			const tools = provider.supportsTools
				? await this.createTools(accessGuard, abortController.signal)
				: undefined;

			await provider.streamChat(
				{
					message: text,
					history,
					context,
					tools,
				},
				{
					onStart: () => {
						webviewView.webview.postMessage({
							type: "responseStart",
							sessionId,
						});
					},
					onChunk: (chunk: string) => {
						assistantText += chunk;

						webviewView.webview.postMessage({
							type: "responseChunk",
							sessionId,
							text: chunk,
						});
					},
					onToolCall: (call) => sendToolCall(webviewView, sessionId, call),
					onToolResult: (_call, result) =>
						sendToolResult(webviewView, sessionId, result),
					onToolRound: (round) => toolRounds.push(compactRound(round)),
					onNotice: (text) => sendToolNotice(webviewView, sessionId, text),
					onEnd: () => {},
				},
				abortController.signal,
			);

			if (assistantText.trim() || toolRounds.length > 0) {
				await this.remember(sessionId, "assistant", assistantText, toolRounds);
				sendChatStore(webviewView, this.chatManager);
			}

			webviewView.webview.postMessage({
				type: "responseEnd",
				sessionId,
			});
		} catch (error) {
			if (abortController.signal.aborted) {
				if (assistantText.trim() || toolRounds.length > 0) {
					await this.remember(
						sessionId,
						"assistant",
						assistantText,
						toolRounds,
					);
					sendChatStore(webviewView, this.chatManager);
				}

				webviewView.webview.postMessage({
					type: "responseStopped",
					sessionId,
				});
				return;
			}

			const errorText = t("chat.errorPrefix", { error: String(error) });

			await this.remember(sessionId, "assistant", errorText);
			sendChatStore(webviewView, this.chatManager);

			webviewView.webview.postMessage({
				type: "responseEnd",
				sessionId,
			});

			webviewView.webview.postMessage({
				type: "backendStatus",
				status: "disconnected",
				backendUrl: config.providerUrl,
				text: t("status.disconnected", { error: String(error) }),
			});
		} finally {
			if (this.currentAbortController === abortController) {
				this.currentAbortController = undefined;
			}
		}
	}
}

// Results are stored cut down: the model only needs enough of them to remember what it did.
function compactRound(round: ToolRound): ToolRound {
	return {
		content: round.content,
		calls: round.calls.map((call) => ({
			...call,
			result:
				call.result.length > MAX_STORED_RESULT_CHARACTERS
					? `${call.result.slice(0, MAX_STORED_RESULT_CHARACTERS)}\n/* result cut when stored */`
					: call.result,
		})),
	};
}

// Keeps the most recent turns that fit the budget, so long conversations do not overflow the model context.
function selectHistory(
	messages: ChatMessage[],
	budget: number,
): ChatHistoryMessage[] {
	const selected: ChatHistoryMessage[] = [];
	let characters = 0;

	for (const message of [...messages].reverse()) {
		// Errors shown in the chat are display text, not something the model said.
		if (message.role === "assistant" && message.content.startsWith("Error: ")) {
			continue;
		}

		let entry = toHistoryMessage(message);

		// A turn whose tool results alone exceed the budget is kept as its written text, so recent history is not lost.
		if (entry.toolRounds && characters + historySize(entry) > budget) {
			entry = { role: message.role, content: message.content };
		}

		// The most recent turn is never dropped whole: its end is what the next message most likely refers to.
		if (selected.length === 0 && historySize(entry) > budget) {
			entry = { role: message.role, content: entry.content.slice(-budget) };
		}

		const size = historySize(entry);

		if (selected.length >= MAX_HISTORY_MESSAGES || characters + size > budget) {
			break;
		}

		characters += size;
		selected.unshift(entry);
	}

	return selected;
}

function toHistoryMessage(message: ChatMessage): ChatHistoryMessage {
	if (!message.toolRounds?.length) {
		return { role: message.role, content: message.content };
	}

	return {
		role: message.role,
		content: closingText(message),
		toolRounds: message.toolRounds,
	};
}

function historySize(message: ChatHistoryMessage): number {
	const rounds = (message.toolRounds ?? []).reduce(
		(total, round) =>
			total +
			round.content.length +
			round.calls.reduce((sum, call) => sum + call.result.length, 0),
		0,
	);

	return message.content.length + rounds;
}
