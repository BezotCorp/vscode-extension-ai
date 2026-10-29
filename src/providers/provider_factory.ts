import { ExtensionConfig } from '../config/extension_config';
import { AiProvider } from './ai_provider';
import { CustomBackendProvider } from './custom_backend_provider';
import { OllamaProvider } from './ollama_provider';

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
        text: 'BezotCorp hosted backend is not available yet.',
      };
    },

    async chat() {
      return {
        text: 'BezotCorp hosted backend is not available yet. Please use Ollama or a custom backend for now.',
      };
    },

    async streamChat(_request, handler) {
      handler.onStart();
      handler.onChunk('BezotCorp hosted backend is not available yet. Please use Ollama or a custom backend for now.');
      handler.onEnd();
    },
  };
}
