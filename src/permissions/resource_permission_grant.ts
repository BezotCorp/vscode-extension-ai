import { PermissionLifetime, ResourcePermissionKind } from ".";

// A remembered filesystem authorization is tied to one tool.
// Allowing read_file on a path does not silently allow delete_file on it.
export type ResourcePermissionGrant = {
	toolId: string;
	path: string;
	kind: ResourcePermissionKind;
	lifetime: PermissionLifetime;
};
