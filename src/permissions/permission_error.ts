import type { PermissionFailureKind } from './permission_failure_kind';

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
