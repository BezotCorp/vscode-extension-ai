import type { OllamaToolCall } from './ollama_tool_call';

export type OllamaStreamResponse = {
	message?: {
		content?: string;
		tool_calls?: OllamaToolCall[];
	};
	error?: string;
	done?: boolean;
};
