import { AiProviderKind } from "../config/extension_config";

export type ModelInfo = {
	id: string;
	name: string;
	provider: AiProviderKind;
};
