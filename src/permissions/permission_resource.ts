import type { ResourceBoundary } from ".";

export type PermissionResource = {
	path: string;
	isDirectory: boolean;
	boundary: ResourceBoundary;
};
