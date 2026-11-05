import type { AiContext, ContextFilter } from "../context";
import type {
	ToolCall,
	ToolExecutionResult,
	ToolRegistry,
	ToolRound,
} from "../tools";
import type { ProviderStatus } from "./provider_status";

export type ChatHistoryMessage = {
	role: "user" | "assistant";
	content: string;
	// Tool calls made before this answer, so the model keeps what it read and did in earlier turns.
	toolRounds?: ToolRound[];
};

export type ChatRequest = {
	message: string;
	// Earlier turns of the active conversation, oldest first, without the current message.
	history?: ChatHistoryMessage[];
	context: AiContext;
	contextFilter?: ContextFilter;
	tools?: ToolRegistry;
};

export type ChatResult = {
	text: string;
};

export type ChatStreamHandler = {
	onStart(): void;
	onChunk(chunk: string): void;
	onToolCall?(call: ToolCall): void;
	onToolResult?(call: ToolCall, result: ToolExecutionResult): void;
	onToolRound?(round: ToolRound): void;
	onNotice?(text: string): void;
	onEnd(): void;
};

export interface AiProvider {
	// Whether this provider speaks the tool calling protocol.
	readonly supportsTools: boolean;
	// Context window the provider will use, in tokens, when it can tell. History and tool results are sized to it.
	resolveContextTokens?(signal?: AbortSignal): Promise<number>;
	health(): Promise<ProviderStatus>;
	chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
	streamChat(
		request: ChatRequest,
		handler: ChatStreamHandler,
		signal?: AbortSignal,
	): Promise<void>;
}
