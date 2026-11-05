import * as vscode from "vscode";

import { en, type MessageKey } from "./messages_en";
import { fr } from "./messages_fr";

export type Locale = "en" | "fr";
export type { MessageKey } from "./messages_en";

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, fr };

// French when VS Code is displayed in French (fr, fr-FR, fr-CA...), English otherwise. One language for the whole UI.
export function currentLocale(): Locale {
	return vscode.env.language.toLowerCase().split(/[-_]/)[0] === "fr"
		? "fr"
		: "en";
}

export function isMessageKey(key: string): key is MessageKey {
	return key in en;
}

export function t(
	key: MessageKey,
	params: Record<string, string | number> = {},
): string {
	return CATALOGS[currentLocale()][key].replace(
		/\{(\w+)\}/g,
		(placeholder, name: string) =>
			name in params ? String(params[name]) : placeholder,
	);
}

// The webview strings (`ui.*`) with their placeholders left in place, for the page to fill.
export function webviewStrings(): Record<string, string> {
	const catalog = CATALOGS[currentLocale()];

	return Object.fromEntries(
		(Object.keys(catalog) as MessageKey[])
			.filter((key) => key.startsWith("ui."))
			.map((key) => [key, catalog[key]]),
	);
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// Titles that mean "no title yet", in every language the extension has used. A stored title is never rewritten for
// being one of these, but it is recognised as the default so the first message can name the conversation.
const DEFAULT_TITLES: ReadonlySet<string> = new Set([
	"New chat",
	en["chat.defaultTitle"],
	fr["chat.defaultTitle"],
]);

export function defaultChatTitle(): string {
	return t("chat.defaultTitle");
}

export function isDefaultChatTitle(title: string): boolean {
	return DEFAULT_TITLES.has(title);
}
