const ERROR_DEFINITIONS = {
  notFound: {
    reason: 'not_found',
    message: 'The path does not exist.',
  },
  alreadyExists: {
    reason: 'already_exists',
    message: 'The destination already exists.',
  },
  permissionDenied: {
    reason: 'os_permission_denied',
    message: 'The operating system denied access.',
  },
  isDirectory: {
    reason: 'is_a_directory',
    message: 'The path is a directory.',
  },
  notDirectory: {
    reason: 'not_a_directory',
    message: 'A path segment is not a directory.',
  },
  noWorkspace: {
    reason: 'no_workspace',
    message: 'No workspace folder is open.',
  },
} as const;

export const ERROR_CODES: Readonly<Record<string, { readonly reason: string; readonly message: string }>> = {
  ENOENT: ERROR_DEFINITIONS.notFound,
  FileNotFound: ERROR_DEFINITIONS.notFound,

  EEXIST: ERROR_DEFINITIONS.alreadyExists,
  FileExists: ERROR_DEFINITIONS.alreadyExists,

  EACCES: ERROR_DEFINITIONS.permissionDenied,
  EPERM: ERROR_DEFINITIONS.permissionDenied,
  NoPermissions: ERROR_DEFINITIONS.permissionDenied,

  EISDIR: ERROR_DEFINITIONS.isDirectory,
  FileIsADirectory: ERROR_DEFINITIONS.isDirectory,

  ENOTDIR: ERROR_DEFINITIONS.notDirectory,
  FileNotADirectory: ERROR_DEFINITIONS.notDirectory,

  NoWorkspace: ERROR_DEFINITIONS.noWorkspace,
} as const;

export function getFileError(error: unknown): (typeof ERROR_CODES)[string] | undefined {
  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === 'string' ? ERROR_CODES[code] : undefined;
}
