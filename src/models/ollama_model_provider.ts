import type { AiProviderKind } from '../config/ai_provider_kind';
import type { ModelInfo } from './model_info';
import type { ModelProvider } from './model_provider';

type OllamaTagsResponse = {
	models?: OllamaModel[];
};

type OllamaModel = {
	name?: string;
	model?: string;
};

export class OllamaModelProvider implements ModelProvider {
	private readonly provider: AiProviderKind = 'ollama';

	constructor(private readonly providerUrl: string) {}

	async listModels(): Promise<ModelInfo[]> {
		const response = await fetch(`${this.providerUrl}/api/tags`, {
			method: 'GET',
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = (await response.json()) as OllamaTagsResponse;

		return (data.models ?? [])
			.map((model) => model.name ?? model.model)
			.filter((name): name is string => Boolean(name))
			.sort((left, right) => left.localeCompare(right))
			.map((name) => ({
				id: name,
				name,
				provider: this.provider,
			}));
	}
}
