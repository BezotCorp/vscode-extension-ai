// What a git tool decided to run, once its parameters are validated.
export type GitPlan = {
	// Arguments after the fixed safety options. The first one is always a git command chosen by the tool.
	args: string[];
	// Wording of the permission question, when "run <tool>" is not enough.
	action?: string;
	// The same wording in the user's language, for the dialog.
	actionLabel?: string;
	detail?: string;
	// Absolute paths the command touches; protected ones always need the user's answer.
	paths?: string[];
	timeoutMs?: number;
};
