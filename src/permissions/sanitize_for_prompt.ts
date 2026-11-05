// Model-provided text is shown in trusted dialogs: strip anything that could fake extra lines or controls.
export function sanitizeForPrompt(text: string, maxLength = 300): string {
	// eslint-disable-next-line no-control-regex
	const clean = text.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]+/g, " ").trim();

	return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
}
