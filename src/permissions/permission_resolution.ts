import { PermissionLifetime, PermissionPolicy } from ".";

export type PermissionResolution = {
	policy: PermissionPolicy;
	lifetime: PermissionLifetime;
};
