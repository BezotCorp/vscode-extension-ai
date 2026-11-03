import * as vscode from 'vscode';

import { getExtensionConfig } from './config/extension_config';
import {
  CHAT_VIEW_ID,
  MANAGE_PERMISSIONS_COMMAND,
  OPEN_CHAT_COMMAND,
  OPEN_PERMISSION_RULES_COMMAND,
  OPEN_SETTINGS_COMMAND,
  REVOKE_ALL_PERMISSIONS_COMMAND,
} from './constants';
import { McpManager } from './mcp';
import { managePermissions, PermissionStore } from './permissions';
import { createBridgeServer } from './server/bridge_server';
import { FileToolServices, listToolPermissions, ToolAccessGuard } from './tools';
import { ChatViewProvider } from './webview/chat_view_provider';

export function activate(context: vscode.ExtensionContext) {
  const permissionStore = new PermissionStore(context.workspaceState);
  // Decisions of the previous permission model (per path and command) no longer mean anything.
  void context.globalState.update('bezotcorpAi.permissionGrants', undefined);
  const bridgeServer = createBridgeServer();
  const mcpManager = new McpManager(() => getExtensionConfig().mcpServers);
  const fileServices = new FileToolServices(context.globalStorageUri.fsPath);

  // A file update that was interrupted (crash, window closed) is resumed from its last persisted state.
  fileServices.writes
    .recover()
    .then((records) => {
      if (records.length > 0) {
        void vscode.window.showWarningMessage(
          `BezotCorp AI: ${records.length} interrupted file write(s) were resumed. Final state: ${records.map((record) => `${record.subject} (${record.state})`).join(', ')}.`,
        );
      }
    })
    .catch((error) => {
      void vscode.window.showErrorMessage(`BezotCorp AI: interrupted file writes could not be resumed: ${String(error)}`);
    });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CHAT_VIEW_ID,
      new ChatViewProvider(context.extensionUri, context.globalStorageUri, permissionStore, mcpManager, fileServices),
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
    vscode.commands.registerCommand(MANAGE_PERMISSIONS_COMMAND, () =>
      managePermissions(permissionStore, () =>
        listToolPermissions(new ToolAccessGuard(permissionStore, () => getExtensionConfig().autonomyMode), mcpManager, fileServices),
      ),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_PERMISSION_RULES_COMMAND, async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'bezotcorpAi.permissions');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REVOKE_ALL_PERMISSIONS_COMMAND, async () => {
      for (const scope of ['session', 'workspace', 'global'] as const) {
        await permissionStore.clearScope(scope);
      }

      await vscode.window.showInformationMessage('BezotCorp AI: all permissions revoked.');
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('bezotcorpAi.mcpServers')) {
        mcpManager.sync();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => mcpManager.dispose()),
  );

  context.subscriptions.push({
    dispose: () => {
      mcpManager.dispose();
      bridgeServer.dispose();
      fileServices.dispose();
    },
  });
}

export function deactivate() {}
