// user_refused: the human explicitly pressed No.
// policy: a permission decision, the autonomy mode or the workspace trust forbids the operation, no human answer involved.
// no_decision: nobody decided (dialog closed, or the request was cancelled while waiting).
export type PermissionFailureKind = 'user_refused' | 'policy' | 'no_decision';

export class PermissionError extends Error {
	constructor(
		readonly kind: PermissionFailureKind,
		readonly reason: string,
		message: string,
		readonly resource?: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'PermissionError';
	}
}
