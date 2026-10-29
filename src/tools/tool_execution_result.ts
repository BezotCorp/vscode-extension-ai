// success: the operation completed.
// error: a technical failure with a known cause.
// denied: not executed because of a human refusal (reason "user_refused") or a policy (for example "read_only_mode").
// cancelled: stopped on request, or never started because nobody decided.
// interrupted: started, then stopped by something other than the user (timeout, crash, lost connection).
// unknown: the final outcome cannot be determined.
export type ToolStatus = 'success' | 'error' | 'denied' | 'cancelled' | 'interrupted' | 'unknown';

export type ToolExecutionResult = {
  status: ToolStatus;
  operation: string;
  resource?: string;
  // Whether the operation was started. "unknown" when even that cannot be told.
  executed: boolean | 'unknown';
  retryable: boolean;
  reason?: string;
  message?: string;
  content?: string;
  details?: Record<string, unknown>;
};
