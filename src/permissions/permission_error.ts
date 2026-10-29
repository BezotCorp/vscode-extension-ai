import { PermissionScope } from '.';

// user_refused: the human explicitly pressed Deny.
// policy: the autonomy mode forbids the operation, no human decision involved.
// no_decision: nobody decided (dialog closed, or the request was cancelled while waiting).
export type PermissionFailureKind = 'user_refused' | 'policy' | 'no_decision';

export class PermissionError extends Error {
  constructor(
    readonly kind: PermissionFailureKind,
    readonly reason: string,
    message: string,
    readonly scope?: PermissionScope,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PermissionError';
  }
}
