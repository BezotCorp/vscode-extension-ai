import { ToolExecutionResult, ToolStatus } from '.';

export const MAX_SERIALIZED_CHARS = 48_000;

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

export function toolSuccess(
  operation: string,
  resource: string | undefined,
  fields: SuccessFields = {},
): ToolExecutionResult {
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

const CUT_MARKER = '\n/* content cut to fit the model context */';

// The result as the model will receive it. When the serialized result is too long, only its content is cut, and cut so
// that the serialization fits `maxChars` exactly (the marker and the flag that tell about the cut are counted).
// `kept` is how many characters of the original content remain in the result. A tool that remembers what the model
// received calls this itself, before remembering, so that what it keeps is what the model gets; serializing the
// result later cuts nothing more.
export function fitToolResult(
  result: ToolExecutionResult,
  maxChars = MAX_SERIALIZED_CHARS,
): { result: ToolExecutionResult; kept: number } {
  const whole = result.content?.length ?? 0;

  if (JSON.stringify(result).length <= maxChars || !result.content) {
    return { result, kept: whole };
  }

  const cutWith = (kept: number): ToolExecutionResult => ({
    ...result,
    content: `${result.content?.slice(0, kept)}${CUT_MARKER}`,
    details: { ...result.details, contentCutForContext: true },
  });
  // Each character removed from the content removes at least one character from the serialization.
  const overflow = JSON.stringify(cutWith(whole)).length - maxChars;
  const kept = Math.max(whole - overflow, 0);

  return { result: cutWith(kept), kept };
}

// What the model receives: one compact JSON object, only the fields that carry information.
export function serializeToolResult(result: ToolExecutionResult, maxChars = MAX_SERIALIZED_CHARS): string {
  return JSON.stringify(fitToolResult(result, maxChars).result);
}
