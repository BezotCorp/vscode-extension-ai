import {
	AccessLevel,
	AccessRequest,
	PermissionResource,
	ToolAccessProfile,
} from ".";

export type PermissionRequest = {
	tool: ToolAccessProfile;

	// What the user is asked about, in English: it is also what the model reads in the outcome of the call.
	action: string;

	// The same, in the user's language, for the dialog. Falls back to `action`.
	actionLabel?: string;

	// Filesystem resources touched by the operation.
	// Empty for tools whose resource cannot be represented as a local filesystem path.
	resources: PermissionResource[];

	detail?: string;

	// Keys of effects produced by this operation.
	effects?: string[];

	warning?: string;

	access?: {
		required: AccessLevel;
		announced?: AccessRequest;
		whyCritical?: string;
	};
};
