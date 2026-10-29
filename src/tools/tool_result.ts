import { ToolExecutionResult, ToolStatus } from '.';

const MAX_SERIALIZED_CHARS = 48_000;

type SuccessFields = {
  content?: string;
  message?: string;
  details?: Record<string, unknown>;
};

type FailureFields = {
  reason: string;
  message: string;
  executed: boolean | 'unknown';
  retryable: boolean;
  content?: string;
  details?: Record<string, unknown>;
};

export function toolSuccess(operation: string, resource: string | undefined, fields: SuccessFields = {}): ToolExecutionResult {
  return { status: 'success', operation, resource, executed: true, retryable: false, ...fields };
}

export function toolFailure(
  status: Exclude<ToolStatus, 'success'>,
  operation: string,
  resource: string | undefined,
  fields: FailureFields,
): ToolExecutionResult {
  return { status, operation, resource, ...fields };
}

const ERROR_CODES: Record<string, { reason: string; message: string }> = {
  ENOENT: { reason: 'not_found', message: 'The path does not exist.' },
  FileNotFound: { reason: 'not_found', message: 'The path does not exist.' },
  EEXIST: { reason: 'already_exists', message: 'The destination already exists.' },
  FileExists: { reason: 'already_exists', message: 'The destination already exists.' },
  EACCES: { reason: 'os_permission_denied', message: 'The operating system denied access.' },
  EPERM: { reason: 'os_permission_denied', message: 'The operating system denied access.' },
  NoPermissions: { reason: 'os_permission_denied', message: 'The operating system denied access.' },
  EISDIR: { reason: 'is_a_directory', message: 'The path is a directory.' },
  FileIsADirectory: { reason: 'is_a_directory', message: 'The path is a directory.' },
  ENOTDIR: { reason: 'not_a_directory', message: 'A path segment is not a directory.' },
  FileNotADirectory: { reason: 'not_a_directory', message: 'A path segment is not a directory.' },
  NoWorkspace: { reason: 'no_workspace', message: 'No workspace folder is open.' },
};

// `sideEffects` tells whether the failed operation could have changed something before failing.
export function toolErrorFromException(
  operation: string,
  resource: string | undefined,
  error: unknown,
  sideEffects: boolean,
): ToolExecutionResult {
  const code = (error as { code?: unknown } | null)?.code;
  const known = typeof code === 'string' ? ERROR_CODES[code] : undefined;
  const detail = error instanceof Error ? error.message : String(error);

  if (known) {
    return toolFailure('error', operation, resource, {
      reason: known.reason,
      message: `${known.message} (${detail})`,
      executed: false,
      retryable: false,
      details: { code },
    });
  }

  return toolFailure('error', operation, resource, {
    reason: 'exception',
    message: detail,
    executed: sideEffects ? 'unknown' : false,
    retryable: false,
  });
}

// What the model receives: one compact JSON object, only the fields that carry information.
export function serializeToolResult(result: ToolExecutionResult): string {
  const serialized = JSON.stringify(result);

  if (serialized.length <= MAX_SERIALIZED_CHARS || !result.content) {
    return serialized;
  }

  const overflow = serialized.length - MAX_SERIALIZED_CHARS;
  const content = `${result.content.slice(0, Math.max(result.content.length - overflow, 0))}\n/* content cut to fit the model context */`;

  return JSON.stringify({ ...result, content, details: { ...result.details, contentCutForContext: true } });
}
