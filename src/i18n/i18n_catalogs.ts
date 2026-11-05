import type { Locale } from './locale';
import { en, type MessageKey } from './messages_en';
import { fr } from './messages_fr';

export const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, fr };

// Titles that mean "no title yet", in every language the extension has used. A stored title is never rewritten for
// being one of these, but it is recognised as the default so the first message can name the conversation.
export const DEFAULT_TITLES: ReadonlySet<string> = new Set([
	'New chat',
	en['chat.defaultTitle'],
	fr['chat.defaultTitle'],
]);
