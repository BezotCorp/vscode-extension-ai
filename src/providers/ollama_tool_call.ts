export type OllamaToolCall = {
	function: {
		name: string;
		arguments: unknown;
	};
};
