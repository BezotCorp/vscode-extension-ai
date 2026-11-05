const CHARS_PER_TOKEN = 3;

export function estimatedCharactersForTokens(tokens: number): number {
	return Math.floor(tokens * CHARS_PER_TOKEN);
}

export function estimatedCharacterBudget(tokens: number, share: number): number {
	return Math.floor(tokens * CHARS_PER_TOKEN * share);
}
