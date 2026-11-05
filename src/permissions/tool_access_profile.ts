import type { PermissionPolicy } from ".";

// What the permission system needs to know about a tool.
export type ToolAccessProfile = {
	id: string;
	name: string;
	// Identity the permission is kept under when it differs from the id (MCP tools keep their real name).
	permissionKey?: string;
	// Applies until the user decides otherwise: ordinary reading and consulting tools allow, the others ask.
	permissionDefault: Exclude<PermissionPolicy, "deny">;
	// True only when the tool can never change anything: it stays available in read-only mode.
	readOnlyCompatible: boolean;
	// Creates, changes, moves or deletes files: the "acceptEdits" mode lets it through inside the workspace.
	editsFiles?: boolean;
	// Runs programs (git, MCP servers) whose behavior depends on the folder: never in an untrusted workspace.
	requiresTrust?: boolean;
};
