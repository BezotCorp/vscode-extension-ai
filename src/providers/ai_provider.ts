import { ChatContext } from '../context/chat_context';
import { ToolCall, ToolExecutionResult, ToolRegistry } from '../tools';
import { ProviderStatus } from './provider_status';

export type ChatRequest = {
  message: string;
  context: ChatContext;
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
  onNotice?(text: string): void;
  onEnd(): void;
};

export interface AiProvider {
  // Whether this provider speaks the tool calling protocol.
  readonly supportsTools: boolean;
  health(): Promise<ProviderStatus>;
  chat(request: ChatRequest): Promise<ChatResult>;
  streamChat(request: ChatRequest, handler: ChatStreamHandler, signal?: AbortSignal): Promise<void>;
}
