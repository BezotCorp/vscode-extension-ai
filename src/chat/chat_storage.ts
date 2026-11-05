import * as vscode from 'vscode';
import { t } from '../i18n';
import type { ChatMessage } from './chat_message';
import { type ChatSession, createChatSessionFromLegacy } from './chat_session';
import { CHAT_FILE_NAME, CHAT_STORE_VERSION } from './chat_storage_constants';
import { type ChatStore, normalizeChatStore } from './chat_store';

export class ChatStorage {
	private saveQueue: Promise<void> = Promise.resolve();

	constructor(private readonly storageUri: vscode.Uri) {}

	async load(): Promise<ChatStore | undefined> {
		const fileUri = vscode.Uri.joinPath(this.storageUri, CHAT_FILE_NAME);

		try {
			const bytes = await vscode.workspace.fs.readFile(fileUri);
			const content = Buffer.from(bytes).toString('utf8');
			const parsed = JSON.parse(content) as unknown;
			const store = migrateChatData(parsed);

			if (!store) {
				await this.keepUnreadableCopy(fileUri, 'unknown format');
			}

			return store;
		} catch (error) {
			if (isFileNotFound(error)) {
				return undefined;
			}

			console.error(`Failed to load chat storage: ${error}`);
			await this.keepUnreadableCopy(fileUri, String(error));
			return undefined;
		}
	}

	// Saves are serialized because every write uses the same temporary file.
	async save(store: ChatStore): Promise<void> {
		const snapshot = normalizeChatStore(store);
		const operation = this.saveQueue.then(() => this.write(snapshot));

		this.saveQueue = operation.catch(() => undefined);

		await operation;
	}

	private async write(store: ChatStore): Promise<void> {
		await vscode.workspace.fs.createDirectory(this.storageUri);

		const fileUri = vscode.Uri.joinPath(this.storageUri, CHAT_FILE_NAME);
		const temporaryUri = vscode.Uri.joinPath(this.storageUri, `${CHAT_FILE_NAME}.tmp`);
		const content = JSON.stringify(store, null, 2);
		const bytes = Buffer.from(content, 'utf8');

		try {
			// Write the complete file aside, then swap it in: an interrupted write never leaves a half-written chat.json.
			await vscode.workspace.fs.writeFile(temporaryUri, bytes);
			await vscode.workspace.fs.rename(temporaryUri, fileUri, {
				overwrite: true,
			});
		} catch (error) {
			console.error(`Failed to save chat storage: ${error}`);
			await Promise.resolve(vscode.workspace.fs.delete(temporaryUri)).catch(() => undefined);
			throw new Error(
				t('notify.storageSaveFailed', {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	// The next save replaces chat.json, so a file that could not be read is copied aside first instead of being lost.
	private async keepUnreadableCopy(fileUri: vscode.Uri, reason: string): Promise<void> {
		const backupUri = vscode.Uri.joinPath(this.storageUri, `chat.unreadable-${Date.now()}.json`);

		try {
			await vscode.workspace.fs.copy(fileUri, backupUri, { overwrite: false });
			void vscode.window.showWarningMessage(t('notify.storageUnreadable', { reason, path: backupUri.fsPath }));
		} catch (error) {
			console.error(`Failed to keep a copy of the unreadable chat storage: ${error}`);
		}
	}
}

function isFileNotFound(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;

	return code === 'FileNotFound' || code === 'ENOENT';
}

function migrateChatData(data: unknown): ChatStore | undefined {
	if (isChatStore(data)) {
		return normalizeChatStore(data);
	}

	if (isLegacyChatSession(data)) {
		const migratedSession = createChatSessionFromLegacy(data.id, data.messages);

		return {
			version: CHAT_STORE_VERSION,
			activeSessionId: migratedSession.id,
			sessions: [migratedSession],
		};
	}

	console.warn('Unknown chat data format');
	return undefined;
}

function isChatStore(data: unknown): data is ChatStore {
	if (!data || typeof data !== 'object') {
		return false;
	}

	const candidate = data as Partial<ChatStore>;

	return (
		candidate.version === CHAT_STORE_VERSION &&
		typeof candidate.activeSessionId === 'string' &&
		Array.isArray(candidate.sessions)
	);
}

function isLegacyChatSession(data: unknown): data is { id: string; messages: ChatMessage[] } {
	if (!data || typeof data !== 'object') {
		return false;
	}

	const candidate = data as Partial<ChatSession>;

	return typeof candidate.id === 'string' && Array.isArray(candidate.messages);
}
