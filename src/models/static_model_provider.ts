import type { AiProviderKind } from '../config/ai_provider_kind';
import type { ModelInfo } from './model_info';
import type { ModelProvider } from './model_provider';

export class StaticModelProvider implements ModelProvider {
  constructor(
    private readonly provider: AiProviderKind,
    private readonly model: string,
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: this.model,
        name: this.model,
        provider: this.provider,
      },
    ];
  }
}
