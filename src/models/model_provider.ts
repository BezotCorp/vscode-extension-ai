import type { ModelInfo } from './model_info';

export interface ModelProvider {
  listModels(): Promise<ModelInfo[]>;
}
