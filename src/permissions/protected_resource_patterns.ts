// Credentials, keys and repository internals. Reading, changing or removing them always needs the user's answer,
// whatever a tool is allowed to do, and they stay out of the context, searches and git output.
export const DEFAULT_PROTECTED = [
	'.env',
	'.env.*',
	'*.pem',
	'*.key',
	'*.p12',
	'*.pfx',
	'id_rsa*',
	'id_ed25519*',
	'id_ecdsa*',
	'.npmrc',
	'.pypirc',
	'.netrc',
	'.git-credentials',
	'.git',
	'.ssh',
	'.aws',
	'.gnupg',
	'.kube',
];

// Templates are meant to be shared.
export const TEMPLATE_SUFFIX = /\.(example|sample|template|dist)$/i;
