import type { AiProviderKind } from '../config/ai_provider_kind';

export type ModelInfo = {
	id: string;
	name: string;
	provider: AiProviderKind;
};
