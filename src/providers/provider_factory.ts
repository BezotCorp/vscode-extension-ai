import type { ExtensionConfig } from '../config/extension_config';
import type { AiProvider } from './ai_provider';
import { CustomBackendProvider } from './custom_backend_provider';
import { OllamaProvider } from './ollama_provider';
import { t } from '../i18n';

export function createProvider(config: ExtensionConfig): AiProvider {
	if (config.provider === 'ollama') {
		return new OllamaProvider(config);
	}

	if (config.provider === 'customBackend') {
		return new CustomBackendProvider(config);
	}

	return {
		supportsTools: false,

		async health() {
			return {
				status: 'disconnected',
				providerUrl: config.providerUrl,
				text: t('status.hostedUnavailable'),
			};
		},

		async chat() {
			return {
				text: t('status.hostedUnavailableChat'),
			};
		},

		async streamChat(_request, handler) {
			handler.onStart();
			handler.onChunk(t('status.hostedUnavailableChat'));
			handler.onEnd();
		},
	};
}
