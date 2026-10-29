import * as vscode from 'vscode';

import { ChatManager } from '../chat/chat_manager';
import { getExtensionConfig } from '../config/extension_config';
import { buildChatContext } from '../context/context_builder';
import { PatchPreview } from '../patch/patch_preview';
import { createProvider } from '../providers/provider_factory';
import { McpManager } from '../mcp';
import { PermissionStore } from '../permissions';
import { createDefaultToolRegistry, ToolAccessGuard, ToolRegistry } from '../tools';
import { ContextOptions } from './context_options';
import { sendChatStore } from './chat_store_presenter';
import { detectAndSendPatchPreviews } from './patch_preview_controller';
import { sendToolCall, sendToolNotice, sendToolResult } from './tool_call_presenter';

export class GenerationController {
  private currentAbortController: AbortController | undefined;
  private readonly toolAccessGuard: ToolAccessGuard;

  constructor(
    private readonly chatManager: ChatManager,
    private readonly patchPreviews: Map<string, PatchPreview>,
    permissionStore: PermissionStore,
    private readonly mcpManager: McpManager,
  ) {
    this.toolAccessGuard = new ToolAccessGuard(permissionStore, () => getExtensionConfig().autonomyMode);
  }

  stopGeneration(): void {
    this.currentAbortController?.abort();
  }

  private async createTools(): Promise<ToolRegistry> {
    const registry = createDefaultToolRegistry(this.toolAccessGuard);

    if (this.toolAccessGuard.mode !== 'readOnly') {
      for (const tool of await this.mcpManager.createTools(this.toolAccessGuard)) {
        registry.register(tool);
      }
    }

    return registry;
  }

  async sendChatMessage(webviewView: vscode.WebviewView, text: string, contextOptions: ContextOptions): Promise<void> {
    const config = getExtensionConfig();
    const provider = createProvider(config);
    const abortController = new AbortController();

    this.currentAbortController?.abort();
    this.currentAbortController = abortController;
    this.toolAccessGuard.beginTurn();

    let assistantText = '';

    try {
      const context = await buildChatContext(config.contextMode, contextOptions);

      webviewView.webview.postMessage({
        type: 'contextStatus',
        activeFilePath: context.activeFile?.path,
      });

      await this.chatManager.addMessage('user', text);
      sendChatStore(webviewView, this.chatManager);

      const tools = provider.supportsTools ? await this.createTools() : undefined;

      await provider.streamChat(
        {
          message: text,
          context,
          tools,
        },
        {
          onStart: () => {
            webviewView.webview.postMessage({
              type: 'responseStart',
            });
          },
          onChunk: (chunk: string) => {
            assistantText += chunk;

            webviewView.webview.postMessage({
              type: 'responseChunk',
              text: chunk,
            });
          },
          onToolCall: (call) => sendToolCall(webviewView, call),
          onToolResult: (_call, result) => sendToolResult(webviewView, result),
          onNotice: (text) => sendToolNotice(webviewView, text),
          onEnd: () => {
            webviewView.webview.postMessage({
              type: 'responseEnd',
            });
          },
        },
        abortController.signal,
      );

      if (assistantText.trim()) {
        await this.chatManager.addMessage('assistant', assistantText);
        sendChatStore(webviewView, this.chatManager);
        detectAndSendPatchPreviews(webviewView, this.patchPreviews, assistantText);
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        if (assistantText.trim()) {
          await this.chatManager.addMessage('assistant', assistantText);
          sendChatStore(webviewView, this.chatManager);
          detectAndSendPatchPreviews(webviewView, this.patchPreviews, assistantText);
        }

        webviewView.webview.postMessage({
          type: 'responseStopped',
        });
        return;
      }

      const errorText = `Error: ${String(error)}`;

      await this.chatManager.addMessage('assistant', errorText);
      sendChatStore(webviewView, this.chatManager);

      webviewView.webview.postMessage({
        type: 'response',
        text: errorText,
      });

      webviewView.webview.postMessage({
        type: 'backendStatus',
        status: 'disconnected',
        backendUrl: config.providerUrl,
        text: `Disconnected: ${String(error)}`,
      });
    } finally {
      if (this.currentAbortController === abortController) {
        this.currentAbortController = undefined;
      }
    }
  }
}
