import * as vscode from 'vscode';

import { ChatManager } from '../chat/chat_manager';
import { ModelManager } from '../models/model_manager';
import { GenerationController } from './generation_controller';
import { WebviewMessage } from '.';
import { sendChatStore } from './chat_store_presenter';
import { sendContextPreview } from './context_preview_presenter';
import { getContextOptions } from './context_options_mapper';
import { sendModelState, testConnection } from './model_state_presenter';

export class WebviewMessageRouter {
  constructor(
    private readonly chatManager: ChatManager,
    private readonly modelManager: ModelManager,
    private readonly generationController: GenerationController,
  ) {}

  async handle(webviewView: vscode.WebviewView, message: WebviewMessage): Promise<void> {
    try {
      await this.dispatch(webviewView, message);
    } catch (error) {
      // Nothing awaits this call, so a failure (for example conversations that cannot be saved) must be shown here.
      void vscode.window.showErrorMessage(
        `BezotCorp AI: ${error instanceof Error ? error.message : String(error)}`,
      );
      sendChatStore(webviewView, this.chatManager);
    }
  }

  private async dispatch(webviewView: vscode.WebviewView, message: WebviewMessage): Promise<void> {
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
      sendChatStore(webviewView, this.chatManager);
      return;
    }

    if (message.type === 'switchChatSession') {
      if (message.sessionId) {
        await this.chatManager.setActiveSession(message.sessionId);
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
        sendChatStore(webviewView, this.chatManager);
      }

      return;
    }

    if (message.type === 'clearHistory') {
      await this.chatManager.clearActiveSession();
      sendChatStore(webviewView, this.chatManager);
      return;
    }

    if (message.type === 'stopGeneration') {
      this.generationController.stopGeneration();
      return;
    }

    if (message.type === 'chat') {
      const contextOptions = getContextOptions(message);

      await sendContextPreview(webviewView, contextOptions);
      await this.generationController.sendChatMessage(webviewView, message.text ?? '', contextOptions);
    }
  }
}
