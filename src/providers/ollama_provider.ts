import type { ExtensionConfig } from '../config/extension_config';
import type { AiContext, ContextFile, ContextFilter, ContextSource } from '../context';
import { estimatedCharacterBudget } from '../context';
import { t } from '../i18n';
import { runToolLoop, type ToolDefinition, type ToolRegistry } from '../tools';
import type { AiProvider } from './ai_provider';
import type { ChatHistoryMessage } from './chat_history_message';
import type { ChatRequest } from './chat_request';
import type { ChatResult } from './chat_result';
import type { ChatStreamHandler } from './chat_stream_handler';
import { MAX_TOOL_ROUNDS, SYSTEM_PROMPT_SHARE, TOOL_CONTEXT_SHARE, TOOL_RESULT_SHARE } from './ollama_limits';
import type { OllamaMessage } from './ollama_message';
import { CAPABILITY_GUIDE, NO_TOOLS_GUIDE, TOOL_RESULT_GUIDE } from './ollama_prompt_guides';
import type { OllamaResponse } from './ollama_response';
import type { OllamaStreamResponse } from './ollama_stream_response';
import type { OllamaToolCall } from './ollama_tool_call';
import type { ProviderStatus } from './provider_status';
import { ToolsUnsupportedError } from './tools_unsupported_error';

export class OllamaProvider implements AiProvider {
	readonly supportsTools = true;

	// Models known to reject tool calling, so the failed attempt is not repeated at every message.
	private static readonly modelsWithoutTools = new Set<string>();
	// Context length each model supports, from /api/show (undefined when the server does not say).
	private static readonly modelContextLimits = new Map<string, number | undefined>();

	constructor(private readonly config: ExtensionConfig) {}

	async health(): Promise<ProviderStatus> {
		try {
			const response = await fetch(`${this.config.providerUrl}/api/tags`, {
				method: 'GET',
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return {
				status: 'connected',
				providerUrl: this.config.providerUrl,
				text: t('status.connectedOllama'),
			};
		} catch (error) {
			return {
				status: 'disconnected',
				providerUrl: this.config.providerUrl,
				text: t('status.disconnected', { error: String(error) }),
			};
		}
	}

	// The window requested in settings, lowered to what the model supports.
	async resolveContextTokens(signal?: AbortSignal): Promise<number> {
		const key = `${this.config.providerUrl}|${this.config.model}`;

		if (!OllamaProvider.modelContextLimits.has(key)) {
			OllamaProvider.modelContextLimits.set(key, await this.readModelContextLimit(signal));
		}

		const limit = OllamaProvider.modelContextLimits.get(key);

		return limit === undefined ? this.config.contextTokens : Math.min(this.config.contextTokens, limit);
	}

	private async readModelContextLimit(signal?: AbortSignal): Promise<number | undefined> {
		try {
			const response = await fetch(`${this.config.providerUrl}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: this.config.model }),
				signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
			});

			if (!response.ok) {
				return undefined;
			}

			const info = ((await response.json()) as { model_info?: Record<string, unknown> }).model_info ?? {};
			const entry = Object.entries(info).find(([name]) => name.endsWith('.context_length'));

			return typeof entry?.[1] === 'number' && entry[1] > 0 ? entry[1] : undefined;
		} catch {
			return undefined;
		}
	}

	async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
		const numCtx = await this.resolveContextTokens(signal);
		const response = await fetch(`${this.config.providerUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal,
			body: JSON.stringify({
				model: this.config.model,
				stream: false,
				options: { num_ctx: numCtx },
				messages: buildMessages(request, false, systemPromptLimit(numCtx)),
			}),
		});

		const data = (await response.json()) as OllamaResponse;

		return {
			text: data.message?.content ?? data.error ?? 'no response',
		};
	}

	async streamChat(request: ChatRequest, handler: ChatStreamHandler, signal?: AbortSignal): Promise<void> {
		const toolsKey = `${this.config.providerUrl}|${this.config.model}`;
		const tools = request.tools && !OllamaProvider.modelsWithoutTools.has(toolsKey) ? request.tools : undefined;

		handler.onStart();

		try {
			await this.runConversation(request, tools, handler, signal);
		} catch (error) {
			// Nothing has run yet when the model rejects tools, so the conversation can safely restart without them.
			if (!(error instanceof ToolsUnsupportedError) || !tools) {
				throw error;
			}

			OllamaProvider.modelsWithoutTools.add(toolsKey);
			handler.onNotice?.(`${t('chat.notice.noTools', { model: this.config.model })}\n\n`);
			await this.runConversation(request, undefined, handler, signal);
		}

		handler.onEnd();
	}

	private async runConversation(
		request: ChatRequest,
		tools: ToolRegistry | undefined,
		handler: ChatStreamHandler,
		signal?: AbortSignal,
	): Promise<void> {
		const definitions = tools?.definitions() ?? [];
		const numCtx = await this.resolveContextTokens(signal);

		await runToolLoop<OllamaMessage>({
			messages: buildMessages(request, tools !== undefined, systemPromptLimit(numCtx)),
			tools,
			maxRounds: MAX_TOOL_ROUNDS,
			signal,
			maxResultChars: estimatedCharacterBudget(numCtx, TOOL_RESULT_SHARE),
			contextBudgetChars: estimatedCharacterBudget(numCtx, TOOL_CONTEXT_SHARE),
			onContextFull: () => handler.onNotice?.(`${t('chat.notice.contextFull')}\n\n`),
			runRound: async (messages, allowTools) => {
				const { content, toolCalls } = await this.streamRound(
					messages,
					allowTools ? definitions : [],
					numCtx,
					handler,
					signal,
				);

				return {
					content,
					toolCalls: toolCalls.map((call) => ({
						name: call.function.name,
						arguments: normalizeArguments(call.function.arguments),
					})),
				};
			},
			assistantMessage: (content, toolCalls) => ({
				role: 'assistant',
				content,
				tool_calls: toolCalls.map((call) => ({
					function: { name: call.name, arguments: call.arguments },
				})),
			}),
			toolMessage: (call, content) => ({
				role: 'tool',
				tool_name: call.name,
				content,
			}),
			onToolCall: (call) => handler.onToolCall?.(call),
			onToolResult: (call, result) => handler.onToolResult?.(call, result),
			onRound: (round) => handler.onToolRound?.(round),
		});
	}

	private async streamRound(
		messages: OllamaMessage[],
		tools: ToolDefinition[],
		numCtx: number,
		handler: ChatStreamHandler,
		signal?: AbortSignal,
	): Promise<{ content: string; toolCalls: OllamaToolCall[] }> {
		const response = await fetch(`${this.config.providerUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal,
			body: JSON.stringify({
				model: this.config.model,
				stream: true,
				options: { num_ctx: numCtx },
				messages,
				...(tools.length > 0 && {
					tools: tools.map((tool) => ({ type: 'function', function: tool })),
				}),
			}),
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => '');

			if (tools.length > 0 && response.status === 400 && /does not support tools/i.test(errorText)) {
				throw new ToolsUnsupportedError();
			}

			throw new Error(`HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 300)}` : ''}`);
		}

		if (!response.body) {
			throw new Error('Streaming response body is empty');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		const toolCalls: OllamaToolCall[] = [];

		let content = '';
		let buffer = '';

		while (true) {
			if (signal?.aborted) {
				throw new Error('Generation aborted');
			}

			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const trimmedLine = line.trim();

				if (!trimmedLine) {
					continue;
				}

				const data = JSON.parse(trimmedLine) as OllamaStreamResponse;

				if (data.error) {
					throw new Error(data.error);
				}

				const chunk = data.message?.content;

				if (chunk) {
					content += chunk;
					handler.onChunk(chunk);
				}

				if (data.message?.tool_calls) {
					toolCalls.push(...data.message.tool_calls);
				}

				if (data.done) {
					return { content, toolCalls };
				}
			}
		}

		return { content, toolCalls };
	}
}

// Ollama expects tool call arguments as an object; some models produce a JSON string instead.
function normalizeArguments(args: unknown): unknown {
	if (typeof args !== 'string') {
		return args ?? {};
	}

	try {
		return JSON.parse(args);
	} catch {
		return args;
	}
}

function systemPromptLimit(numCtx: number): number {
	return estimatedCharacterBudget(numCtx, SYSTEM_PROMPT_SHARE);
}

function buildMessages(request: ChatRequest, withTools: boolean, systemLimit: number): OllamaMessage[] {
	return [
		{
			role: 'system',
			content: buildSystemPrompt(
				request.context,
				request.contextFilter ?? 'all',
				buildGuide(request, withTools),
				systemLimit,
			),
		},
		...(request.history ?? []).flatMap((message) => historyMessages(message, withTools)),
		{
			role: 'user',
			content: request.message,
		},
	];
}

function historyMessages(message: ChatHistoryMessage, withTools: boolean): OllamaMessage[] {
	const hasText = message.content.trim() !== '';
	const closing: OllamaMessage[] = hasText ? [{ role: message.role, content: message.content }] : [];

	// Without tools in this request, earlier tool traffic would be unexplained noise (or rejected by the model).
	if (!withTools || !message.toolRounds?.length) {
		return closing;
	}

	const rounds = message.toolRounds.flatMap((round): OllamaMessage[] => [
		{
			role: 'assistant',
			content: round.content,
			tool_calls: round.calls.map((call) => ({
				function: { name: call.name, arguments: call.arguments },
			})),
		},
		...round.calls.map(
			(call): OllamaMessage => ({
				role: 'tool',
				tool_name: call.name,
				content: call.result,
			}),
		),
	]);

	return [...rounds, ...closing];
}

// Context sources are filtered independently from context collection. Today every available source is injected
// by default. A future symbolic or automatic selector can provide a narrower ContextFilter without changing AiContext.
function buildSystemPrompt(context: AiContext, filter: ContextFilter, guide: string, limit: number): string {
	const full = composeSystemPrompt(context, filter, guide);

	if (full.length <= limit) {
		return full;
	}

	const activeFile = context.editor.activeFile;

	if (!includesContextSource(filter, 'editor') || !activeFile) {
		return full;
	}

	const room = Math.max(limit - (full.length - activeFile.content.length), 0);
	const shrunk: AiContext = {
		...context,
		editor: {
			...context.editor,
			activeFile: {
				...activeFile,
				content: cut(activeFile.content, room),
			},
		},
	};

	return composeSystemPrompt(shrunk, filter, guide);
}

function cut(text: string, maxChars: number): string {
	return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n/* cut to fit the model context */`;
}

function composeSystemPrompt(context: AiContext, filter: ContextFilter, guide: string): string {
	const parts = [
		'You are BezotCorp AI, a coding assistant inside VS Code.',
		'Answer clearly and focus on practical code help.',
	];

	parts.push(guide);

	if (includesContextSource(filter, 'editor') && context.editor.activeFile) {
		parts.push(formatFile('Active file', context.editor.activeFile));
	}

	return parts.join('\n\n');
}

function includesContextSource(filter: ContextFilter, source: ContextSource): boolean {
	return filter === 'all' || filter.includes(source);
}

function buildGuide(request: ChatRequest, withTools: boolean): string {
	if (!withTools) {
		return NO_TOOLS_GUIDE;
	}

	const unavailable = request.tools?.unavailableTools() ?? [];
	const notOffered =
		unavailable.length > 0
			? `\nNot available right now: ${unavailable.map((tool) => `${tool.id} (${tool.reason})`).join('; ')}.`
			: '';

	return `${CAPABILITY_GUIDE}${notOffered}\n${TOOL_RESULT_GUIDE}`;
}

function formatFile(label: string, file: ContextFile): string {
	return `${label}: ${file.path}
Language: ${file.languageId}

\`\`\`${file.languageId}
${file.content}
\`\`\``;
}
