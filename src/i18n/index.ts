import * as vscode from 'vscode';

import { CATALOGS, DEFAULT_TITLES } from './i18n_catalogs';
import type { Locale } from './locale';
import { en, type MessageKey } from './messages_en';

export type { Locale } from './locale';
export type { MessageKey } from './messages_en';

// French when VS Code is displayed in French (fr, fr-FR, fr-CA...), English otherwise. One language for the whole UI.
export function currentLocale(): Locale {
	return vscode.env.language.toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : 'en';
}

export function isMessageKey(key: string): key is MessageKey {
	return key in en;
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
	return CATALOGS[currentLocale()][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
		name in params ? String(params[name]) : placeholder,
	);
}

// The webview strings (`ui.*`) with their placeholders left in place, for the page to fill.
export function webviewStrings(): Record<string, string> {
	const catalog = CATALOGS[currentLocale()];

	return Object.fromEntries(
		(Object.keys(catalog) as MessageKey[]).filter((key) => key.startsWith('ui.')).map((key) => [key, catalog[key]]),
	);
}

export function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function defaultChatTitle(): string {
	return t('chat.defaultTitle');
}

export function isDefaultChatTitle(title: string): boolean {
	return DEFAULT_TITLES.has(title);
}
