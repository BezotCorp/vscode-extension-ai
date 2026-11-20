// Credentials, keys and repository internals. Filesystem content access and operations that change or remove
// them require the protected-resource confirmation defined by the permission system. Automatic context and ordinary
// filesystem search must not disclose their content without that confirmation. Git output is intentionally not
// filtered here: if a sensitive file is versioned, that fact remains visible as part of the repository state.
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
