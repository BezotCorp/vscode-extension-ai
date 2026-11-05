import type { ExtensionConfig } from '../config/extension_config';
import type { ModelInfo } from './model_info';

export type ModelState = {
	provider: ExtensionConfig['provider'];
	providerUrl: string;
	activeModel: string;
	models: ModelInfo[];
	error?: string;
};
