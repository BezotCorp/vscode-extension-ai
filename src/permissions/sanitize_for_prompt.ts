// Model-provided text is shown in trusted dialogs: strip anything that could fake extra lines or controls.
export function sanitizeForPrompt(text: string, maxLength = 300): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control and bidi characters are intentionally removed from model-provided text
	const clean = text.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim();

	return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
}
