export const ERROR_CODES: Record<string, { reason: string; message: string }> = {
	ENOENT: { reason: 'not_found', message: 'The path does not exist.' },
	FileNotFound: { reason: 'not_found', message: 'The path does not exist.' },
	EEXIST: {
		reason: 'already_exists',
		message: 'The destination already exists.',
	},
	FileExists: {
		reason: 'already_exists',
		message: 'The destination already exists.',
	},
	EACCES: {
		reason: 'os_permission_denied',
		message: 'The operating system denied access.',
	},
	EPERM: {
		reason: 'os_permission_denied',
		message: 'The operating system denied access.',
	},
	NoPermissions: {
		reason: 'os_permission_denied',
		message: 'The operating system denied access.',
	},
	EISDIR: { reason: 'is_a_directory', message: 'The path is a directory.' },
	FileIsADirectory: {
		reason: 'is_a_directory',
		message: 'The path is a directory.',
	},
	ENOTDIR: {
		reason: 'not_a_directory',
		message: 'A path segment is not a directory.',
	},
	FileNotADirectory: {
		reason: 'not_a_directory',
		message: 'A path segment is not a directory.',
	},
	NoWorkspace: {
		reason: 'no_workspace',
		message: 'No workspace folder is open.',
	},
};
