import { availableLocales } from './catalog';

export type Locale = string;

export const DEFAULT_LOCALE: Locale = 'en';

// The catalog to use for a language tag: the exact locale, else its base language, else the default one.
export function resolveLocale(language: string): Locale {
	const normalized = language.trim().toLowerCase().replaceAll('_', '-');
	const locales = availableLocales();
	const find = (wanted: string): Locale | undefined => locales.find((locale) => locale.toLowerCase() === wanted);

	return find(normalized) ?? find(normalized.split('-')[0]) ?? DEFAULT_LOCALE;
}

// Where a message is looked for, most specific first: fr-CA, fr, en.
export function localeChain(locale: Locale): Locale[] {
	const available = new Set(availableLocales());
	const base = locale.split('-')[0];

	return [...new Set([locale, base, DEFAULT_LOCALE])].filter((candidate) => available.has(candidate));
}
