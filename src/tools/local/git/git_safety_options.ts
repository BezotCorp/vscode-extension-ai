// Options placed before every command: nothing a repository's own configuration says can start a program through
// them (file system monitor, pager, external protocol helpers, credential prompts), and output is plain text.
export const SAFETY_OPTIONS = [
	'--no-pager',
	'-c',
	'core.fsmonitor=false',
	'-c',
	'core.pager=cat',
	'-c',
	'core.quotepath=false',
	'-c',
	'color.ui=false',
	'-c',
	'protocol.ext.allow=never',
];
