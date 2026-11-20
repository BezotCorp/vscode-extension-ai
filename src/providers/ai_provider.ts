import type { ChatRequest } from './chat_request';
import type { ChatResult } from './chat_result';
import type { ChatStreamHandler } from './chat_stream_handler';
import type { ProviderStatus } from './provider_status';

export interface AiProvider {
  // Whether this provider speaks the tool calling protocol.
  readonly supportsTools: boolean;
  // Context window the provider will use, in tokens, when it can tell. History and tool results are sized to it.
  resolveContextTokens?(signal?: AbortSignal): Promise<number>;
  health(): Promise<ProviderStatus>;
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
  streamChat(request: ChatRequest, handler: ChatStreamHandler, signal?: AbortSignal): Promise<void>;
}
