import * as vscode from 'vscode';

import { ChatManager } from '../chat/chat_manager';
import { ChatStorage } from '../chat/chat_storage';
import { McpManager } from '../mcp';
import { ModelManager } from '../models/model_manager';
import { PatchPreview } from '../patch/patch_preview';
import { PermissionStore } from '../permissions';
import { getChatHtml } from './html/chat_html';
import { WebviewMessage } from '.';
import { sendChatStore } from './chat_store_presenter';
import { sendModelState, testConnection } from './model_state_presenter';
import { sendContextPreview } from './context_preview_presenter';
import { GenerationController } from './generation_controller';
import { WebviewMessageRouter } from './webview_message_router';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private readonly chatManager: ChatManager;
  private readonly modelManager = new ModelManager();
  private readonly patchPreviews = new Map<string, PatchPreview>();
  private readonly generationController: GenerationController;
  private readonly messageRouter: WebviewMessageRouter;

  constructor(
    private readonly extensionUri: vscode.Uri,
    storageUri: vscode.Uri,
    permissionStore: PermissionStore,
    mcpManager: McpManager,
  ) {
    this.chatManager = new ChatManager(new ChatStorage(storageUri));
    this.generationController = new GenerationController(this.chatManager, this.patchPreviews, permissionStore, mcpManager);
    this.messageRouter = new WebviewMessageRouter(
      this.chatManager,
      this.modelManager,
      this.patchPreviews,
      this.generationController,
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = getChatHtml();

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.messageRouter.handle(webviewView, message);
    });

    void this.initialize(webviewView);
  }

  private async initialize(webviewView: vscode.WebviewView): Promise<void> {
    await this.chatManager.load();

    sendChatStore(webviewView, this.chatManager);

    await testConnection(webviewView);
    await sendModelState(webviewView, this.modelManager);

    await sendContextPreview(webviewView, {
      includeActiveFile: true,
      includeOpenFiles: false,
      includeSelectedText: true,
      includeWorkspaceTree: false,
    });
  }
}
