import type { ExtensionConfig } from '../config/extension_config';
import { t } from '../i18n';
import type { AiProvider } from './ai_provider';
import type { ChatRequest } from './chat_request';
import type { ChatResult } from './chat_result';
import type { ChatStreamHandler } from './chat_stream_handler';
import type { CustomBackendResponse } from './custom_backend_response';
import type { ProviderStatus } from './provider_status';

export class CustomBackendProvider implements AiProvider {
	readonly supportsTools = false;

	constructor(private readonly config: ExtensionConfig) {}

	async health(): Promise<ProviderStatus> {
		try {
			const response = await fetch(`${this.config.providerUrl}/health`, {
				method: 'GET',
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return {
				status: 'connected',
				providerUrl: this.config.providerUrl,
				text: t('status.connected'),
			};
		} catch (error) {
			return {
				status: 'disconnected',
				providerUrl: this.config.providerUrl,
				text: t('status.disconnected', { error: String(error) }),
			};
		}
	}

	async chat(request: ChatRequest): Promise<ChatResult> {
		const response = await this.requestChat(request);

		return {
			text: response.content ?? response.error ?? 'no response',
		};
	}

	async streamChat(request: ChatRequest, handler: ChatStreamHandler, signal?: AbortSignal): Promise<void> {
		handler.onStart();

		const response = await this.requestChat(request, signal);

		handler.onChunk(response.content ?? response.error ?? 'no response');

		handler.onEnd();
	}

	private async requestChat(request: ChatRequest, signal?: AbortSignal): Promise<CustomBackendResponse> {
		const response = await fetch(`${this.config.providerUrl}/chat`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
			signal,
		});

		if (!response.ok) {
			const detail = await response.text().catch(() => '');

			throw new Error(`HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
		}

		return (await response.json()) as CustomBackendResponse;
	}
}
