import type { PermissionLifetime, PermissionPolicy } from '.';

export type PermissionEntry = {
	toolId: string;
	policy: PermissionPolicy;
	lifetime: PermissionLifetime;
};
