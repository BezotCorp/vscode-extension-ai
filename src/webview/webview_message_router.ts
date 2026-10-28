import * as vscode from 'vscode';

import { ChatManager } from '../chat/chat_manager';
import { ModelManager } from '../models/model_manager';
import { PatchPreview } from '../patch/patch_preview';
import { GenerationController } from './generation_controller';
import { WebviewMessage } from '.';
import { sendChatStore } from './chat_store_presenter';
import { sendContextPreview } from './context_preview_presenter';
import { getContextOptions } from './context_options_mapper';
import { sendModelState, testConnection } from './model_state_presenter';
import { acceptPatch, rejectPatch } from './patch_preview_controller';

export class WebviewMessageRouter {
  constructor(
    private readonly chatManager: ChatManager,
    private readonly modelManager: ModelManager,
    private readonly patchPreviews: Map<string, PatchPreview>,
    private readonly generationController: GenerationController,
  ) {}

  async handle(webviewView: vscode.WebviewView, message: WebviewMessage): Promise<void> {
    if (message.type === 'copyMessage') {
      if (typeof message.text === 'string') {
        await vscode.env.clipboard.writeText(message.text);
      }
      return;
    }

    if (message.type === 'openSettings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bezotcorp.bezotcorp-ai');
      return;
    }

    if (message.type === 'testConnection') {
      await testConnection(webviewView);
      await sendModelState(webviewView, this.modelManager);
      return;
    }

    if (message.type === 'refreshModels') {
      await sendModelState(webviewView, this.modelManager);
      return;
    }

    if (message.type === 'updateProviderSettings') {
      if (message.provider && message.providerUrl) {
        await this.modelManager.updateProviderSettings(message.provider, message.providerUrl);
        await testConnection(webviewView);
        await sendModelState(webviewView, this.modelManager);
      }

      return;
    }

    if (message.type === 'changeModel') {
      if (message.model) {
        await this.modelManager.setActiveModel(message.model);
        await sendModelState(webviewView, this.modelManager);
      }

      return;
    }

    if (message.type === 'refreshContextPreview') {
      await sendContextPreview(webviewView, getContextOptions(message));
      return;
    }

    if (message.type === 'newChat') {
      await this.chatManager.createSession();
      this.clearPatchPreviews(webviewView);
      sendChatStore(webviewView, this.chatManager);
      return;
    }

    if (message.type === 'switchChatSession') {
      if (message.sessionId) {
        await this.chatManager.setActiveSession(message.sessionId);
        this.clearPatchPreviews(webviewView);
        sendChatStore(webviewView, this.chatManager);
      }

      return;
    }

    if (message.type === 'renameChatSession') {
      if (message.sessionId && message.title) {
        await this.chatManager.renameSession(message.sessionId, message.title);
        sendChatStore(webviewView, this.chatManager);
      }

      return;
    }

    if (message.type === 'deleteChatSession') {
      if (message.sessionId) {
        await this.chatManager.deleteSession(message.sessionId);
        this.clearPatchPreviews(webviewView);
        sendChatStore(webviewView, this.chatManager);
      }

      return;
    }

    if (message.type === 'clearHistory') {
      await this.chatManager.clearActiveSession();
      this.clearPatchPreviews(webviewView);
      sendChatStore(webviewView, this.chatManager);
      return;
    }

    if (message.type === 'stopGeneration') {
      this.generationController.stopGeneration();
      return;
    }

    if (message.type === 'acceptPatch') {
      await acceptPatch(webviewView, this.patchPreviews, message.patchId);
      return;
    }

    if (message.type === 'rejectPatch') {
      rejectPatch(webviewView, this.patchPreviews, message.patchId);
      return;
    }

    if (message.type === 'chat') {
      const contextOptions = getContextOptions(message);

      await sendContextPreview(webviewView, contextOptions);
      await this.generationController.sendChatMessage(webviewView, message.text ?? '', contextOptions);
    }
  }

  private clearPatchPreviews(webviewView: vscode.WebviewView): void {
    this.patchPreviews.clear();
    webviewView.webview.postMessage({ type: 'patchPreviews', previews: [] });
  }
}
