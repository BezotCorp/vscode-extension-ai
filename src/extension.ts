import * as vscode from 'vscode';

import { getExtensionConfig } from './config/extension_config';
import {
  CHAT_VIEW_ID,
  MANAGE_PERMISSIONS_COMMAND,
  OPEN_CHAT_COMMAND,
  OPEN_SETTINGS_COMMAND,
  REVOKE_ALL_PERMISSIONS_COMMAND,
} from './constants';
import { McpManager } from './mcp';
import { managePermissions, PermissionStore } from './permissions';
import { createBridgeServer } from './server/bridge_server';
import { ChatViewProvider } from './webview/chat_view_provider';

export function activate(context: vscode.ExtensionContext) {
  const bridgeServer = createBridgeServer();
  const permissionStore = new PermissionStore(context.globalState);
  const mcpManager = new McpManager(() => getExtensionConfig().mcpServers);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CHAT_VIEW_ID,
      new ChatViewProvider(context.extensionUri, context.globalStorageUri, permissionStore, mcpManager),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_CHAT_COMMAND, async () => {
      await vscode.commands.executeCommand('workbench.view.extension.bezotcorp-ai');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_SETTINGS_COMMAND, async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bezotcorp.bezotcorp-ai');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(MANAGE_PERMISSIONS_COMMAND, () => managePermissions(permissionStore)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REVOKE_ALL_PERMISSIONS_COMMAND, async () => {
      await permissionStore.revokeAll();
      await vscode.window.showInformationMessage('BezotCorp AI: all permissions revoked.');
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      mcpManager.dispose();
      bridgeServer.dispose();
    },
  });
}

export function deactivate() {}
