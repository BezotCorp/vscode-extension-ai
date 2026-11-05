import type * as vscode from 'vscode';

import type { ResourcePermissionGrant } from '.';

export type PermissionItem = vscode.QuickPickItem & {
	toolId?: string;
	grant?: ResourcePermissionGrant;
};
