import * as path from 'node:path';
import * as vscode from 'vscode';

import { pathMatches } from './path_matches';

// Credentials, keys and repository internals. Reading, changing or removing them always needs the user's answer,
// whatever a tool is allowed to do, and they stay out of the context, searches and git output.
const DEFAULT_PROTECTED = [
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
const TEMPLATE_SUFFIX = /\.(example|sample|template|dist)$/i;

export function getProtectedPatterns(): string[] {
  const added = vscode.workspace.getConfiguration('bezotcorpAi').inspect<string[]>('protectedPaths')?.globalValue;

  return [...DEFAULT_PROTECTED, ...(Array.isArray(added) ? added.filter((item) => typeof item === 'string') : [])];
}

// The pattern that protects this path, if any.
export function isProtectedResource(fsPath: string): string | undefined {
  if (TEMPLATE_SUFFIX.test(path.basename(fsPath))) {
    return undefined;
  }

  const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);

  return getProtectedPatterns().find((pattern) => pathMatches(pattern, fsPath, roots));
}

// The same protection for git output, as pathspecs that leave the files out of a diff or a show.
export function protectedPathspecs(): string[] {
  return getProtectedPatterns().flatMap((pattern) => {
    if (pattern.startsWith('//') || pattern.startsWith('~/')) {
      return [];
    }

    const relative = pattern.replace(/^\.\//, '').replace(/^\//, '');
    const anywhere = pattern.startsWith('/') || relative.includes('/') ? relative : `**/${relative}`;

    return [`:(exclude,glob)${anywhere}`, `:(exclude,glob)${anywhere}/**`];
  });
}
