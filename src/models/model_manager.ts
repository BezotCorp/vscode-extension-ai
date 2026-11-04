import {
  AiProviderKind,
  ExtensionConfig,
  getExtensionConfig,
  updateExtensionModel,
  updateExtensionProviderSettings,
} from '../config/extension_config';
import { ModelInfo } from './model_info';
import { createModelProvider } from './model_registry';

export type ModelState = {
  provider: ExtensionConfig['provider'];
  providerUrl: string;
  activeModel: string;
  models: ModelInfo[];
  error?: string;
};

export class ModelManager {
  async getState(): Promise<ModelState> {
    const config = getExtensionConfig();

    try {
      const models = await createModelProvider(config).listModels();

      return {
        provider: config.provider,
        providerUrl: config.providerUrl,
        activeModel: config.model,
        models: ensureActiveModelExists(models, config),
      };
    } catch (error) {
      return {
        provider: config.provider,
        providerUrl: config.providerUrl,
        activeModel: config.model,
        models: [
          {
            id: config.model,
            name: config.model,
            provider: config.provider,
          },
        ],
        error: String(error),
      };
    }
  }

  async setActiveModel(model: string): Promise<ModelState> {
    await updateExtensionModel(model);

    return this.getState();
  }

  async updateProviderSettings(provider: AiProviderKind, providerUrl: string): Promise<ModelState> {
    await updateExtensionProviderSettings(provider, providerUrl);

    return this.getState();
  }
}

function ensureActiveModelExists(models: ModelInfo[], config: ExtensionConfig): ModelInfo[] {
  if (models.some((model) => model.id === config.model)) {
    return models;
  }

  return [
    {
      id: config.model,
      name: config.model,
      provider: config.provider,
    },
    ...models,
  ];
}
