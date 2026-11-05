import * as vscode from "vscode";

import { ChatManager } from "../chat/chat_manager";
import { ModelManager } from "../models/model_manager";
import { GenerationController } from "./generation_controller";
import { WebviewMessage } from ".";
import { sendChatStore } from "./chat_store_presenter";
import { sendModelState, testConnection } from "./model_state_presenter";
import { t } from "../i18n";

export class WebviewMessageRouter {
	constructor(
		private readonly chatManager: ChatManager,
		private readonly modelManager: ModelManager,
		private readonly generationController: GenerationController,
	) {}

	async handle(
		webviewView: vscode.WebviewView,
		message: WebviewMessage,
	): Promise<void> {
		try {
			await this.dispatch(webviewView, message);
		} catch (error) {
			void vscode.window.showErrorMessage(
				t("notify.error", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);

			sendChatStore(webviewView, this.chatManager);
		}
	}

	private async dispatch(
		webviewView: vscode.WebviewView,
		message: WebviewMessage,
	): Promise<void> {
		if (message.type === "webviewReady") {
			sendChatStore(webviewView, this.chatManager);
			await testConnection(webviewView);
			await sendModelState(webviewView, this.modelManager);
			return;
		}

		if (message.type === "copyMessage") {
			await vscode.env.clipboard.writeText(message.text);
			return;
		}

		if (message.type === "openSettings") {
			await vscode.commands.executeCommand(
				"workbench.action.openSettings",
				"@ext:bezotcorp.bezotcorp-ai",
			);
			return;
		}

		if (message.type === "testConnection") {
			await testConnection(webviewView);
			await sendModelState(webviewView, this.modelManager);
			return;
		}

		if (message.type === "refreshModels") {
			await sendModelState(webviewView, this.modelManager);
			return;
		}

		if (message.type === "updateProviderSettings") {
			await this.modelManager.updateProviderSettings(
				message.provider,
				message.providerUrl,
			);

			await testConnection(webviewView);

			await sendModelState(webviewView, this.modelManager);
			return;
		}

		if (message.type === "changeModel") {
			await this.modelManager.setActiveModel(message.model);

			await sendModelState(webviewView, this.modelManager);
			return;
		}

		if (message.type === "newChat") {
			await this.chatManager.createSession();
			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "switchChatSession") {
			await this.chatManager.setActiveSession(message.sessionId);

			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "renameChatSession") {
			await this.chatManager.renameSession(message.sessionId, message.title);

			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "archiveChatSession") {
			await this.chatManager.archiveSession(message.sessionId);

			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "restoreChatSession") {
			await this.chatManager.restoreArchivedSession(message.sessionId);

			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "trashChatSession") {
			await this.chatManager.trashSession(message.sessionId);

			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "restoreTrashedChatSession") {
			await this.chatManager.restoreTrashedSession(message.sessionId);

			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "deleteChatSession") {
			const confirmation = await vscode.window.showWarningMessage(
				t("chat.confirm.delete.title"),
				{
					modal: true,
					detail: t("chat.confirm.delete.detail"),
				},
				t("chat.confirm.delete.button"),
			);

			if (confirmation !== t("chat.confirm.delete.button")) {
				return;
			}

			await this.chatManager.deleteTrashedSession(message.sessionId);

			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "clearCurrentSession") {
			const confirmation = await vscode.window.showWarningMessage(
				t("chat.confirm.clear.title"),
				{
					modal: true,
					detail: t("chat.confirm.clear.detail"),
				},
				t("chat.confirm.clear.button"),
			);

			if (confirmation !== t("chat.confirm.clear.button")) {
				return;
			}

			const activeSessionId = this.chatManager.getActiveSession()?.id;

			if (activeSessionId) {
				await this.generationController.stopGenerationForSessionAndWait(
					activeSessionId,
				);
			}

			await this.chatManager.clearActiveSession();
			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "trashArchivedSessions") {
			await this.chatManager.trashArchivedSessions();
			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "emptyTrash") {
			const confirmation = await vscode.window.showWarningMessage(
				t("chat.confirm.emptyTrash.title"),
				{
					modal: true,
					detail: t("chat.confirm.emptyTrash.detail"),
				},
				t("chat.confirm.emptyTrash.button"),
			);

			if (confirmation !== t("chat.confirm.emptyTrash.button")) {
				return;
			}

			await this.chatManager.emptyTrash();
			sendChatStore(webviewView, this.chatManager);
			return;
		}

		if (message.type === "stopGeneration") {
			this.generationController.stopGeneration();
			return;
		}

		if (message.type === "chat") {
			await this.generationController.sendChatMessage(
				webviewView,
				message.text,
			);
		}
	}
}
