export const MAX_FILE_CHARS = 40_000;

// Generated or vendored directories left out of listings and searches by default, only to avoid noise. This is
// visibility, not protection: the model can ask for them explicitly (includeIgnored), and protected resources are a
// separate, authorization concern.
export const IGNORED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

export const WORKSPACE_EXCLUDE_GLOB = `**/{${[...IGNORED_DIRECTORIES].join(',')}}/**`;
