import { availableLocales, lookup, namespaceMessages } from './catalog';
import { DEFAULT_LOCALE, type Locale, localeChain, resolveLocale } from './locale';

const WEBVIEW_NAMESPACE = 'ui';

let activeLocale: Locale = DEFAULT_LOCALE;

const LEGACY_DEFAULT_CHAT_TITLES = new Set<string>(['New chat']);

export function configureLocale(language: string): Locale {
  activeLocale = resolveLocale(language);

  return activeLocale;
}

export function currentLocale(): Locale {
  return activeLocale;
}

// A key is "namespace.key": the namespace is what comes before the first dot.
function find(locale: Locale, key: string): string | undefined {
  const dot = key.indexOf('.');

  if (dot <= 0) {
    return undefined;
  }

  const namespace = key.slice(0, dot);
  const name = key.slice(dot + 1);

  for (const candidate of localeChain(locale)) {
    const value = lookup(candidate, namespace, name);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function isMessageKey(key: string): boolean {
  return find(activeLocale, key) !== undefined;
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  const message = find(activeLocale, key);

  if (message === undefined) {
    throw new Error(`Missing i18n message ${activeLocale}: ${key}`);
  }

  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

// What the webview scripts need, as "ui.key" -> text, with the same fallback as t().
export function webviewStrings(): Record<string, string> {
  const strings: Record<string, string> = {};

  for (const locale of localeChain(activeLocale)) {
    for (const [key, value] of namespaceMessages(locale, WEBVIEW_NAMESPACE)) {
      strings[`${WEBVIEW_NAMESPACE}.${key}`] ??= value;
    }
  }

  return strings;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function defaultChatTitle(): string {
  return t('chat.defaultTitle');
}

export function isDefaultChatTitle(title: string): boolean {
  return (
    LEGACY_DEFAULT_CHAT_TITLES.has(title) ||
    availableLocales().some((locale) => lookup(locale, 'chat', 'defaultTitle') === title)
  );
}
