import { ExtensionConfig } from "../config/extension_config";
import { ModelProvider } from "./model_provider";
import { OllamaModelProvider } from "./ollama_model_provider";
import { StaticModelProvider } from "./static_model_provider";

export function createModelProvider(config: ExtensionConfig): ModelProvider {
	if (config.provider === "ollama") {
		return new OllamaModelProvider(config.providerUrl);
	}

	return new StaticModelProvider(config.provider, config.model);
}
