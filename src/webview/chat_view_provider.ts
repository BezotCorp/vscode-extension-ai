import type * as vscode from 'vscode';

import { ChatManager } from '../chat/chat_manager';
import { ChatStorage } from '../chat/chat_storage';
import type { McpManager } from '../mcp';
import { ModelManager } from '../models/model_manager';
import type { PermissionStore } from '../permissions';
import { getChatHtml } from './html/chat_html';
import type { WebviewMessage } from '.';
import type { FileToolServices } from '../tools';
import { GenerationController } from './generation_controller';
import { WebviewMessageRouter } from './webview_message_router';

export class ChatViewProvider implements vscode.WebviewViewProvider {
	private readonly chatManager: ChatManager;
	private readonly modelManager = new ModelManager();
	private readonly generationController: GenerationController;
	private readonly messageRouter: WebviewMessageRouter;

	constructor(
		storageUri: vscode.Uri,
		permissionStore: PermissionStore,
		mcpManager: McpManager,
		files: FileToolServices,
	) {
		this.chatManager = new ChatManager(new ChatStorage(storageUri));
		this.generationController = new GenerationController(this.chatManager, permissionStore, mcpManager, files);
		this.messageRouter = new WebviewMessageRouter(this.chatManager, this.modelManager, this.generationController);
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		webviewView.webview.options = {
			enableScripts: true,
		};

		webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
			void this.messageRouter.handle(webviewView, message);
		});

		void this.initialize(webviewView);
	}

	private async initialize(webviewView: vscode.WebviewView): Promise<void> {
		await this.chatManager.load();

		webviewView.webview.html = getChatHtml();
	}
}
