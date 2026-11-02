import * as path from 'node:path';

import { resolvePath } from '../../../workspace';
import { readNumberArg, readStringArg } from '../../tool_input';
import { RepositoryPaths } from './repository_paths';

const REF = /^[A-Za-z0-9_][A-Za-z0-9._/@{}^~+-]*$/;
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;
const REMOTE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const MAX_PATHS = 50;
const MAX_MESSAGE_CHARS = 4_000;

// Each reader returns the validated value or an error message for the model. Nothing a parameter contains can
// become an option: values never start with "-", and paths are passed as literal pathspecs after "--".

// A revision such as "HEAD~2", "main..feature" or "v1.2". No ":" (which would read a file at a revision, past the
// protection of credentials) and no spaces.
export function readRevision(input: unknown, key: string): string | undefined | Error {
  const value = readStringArg(input, key);

  if (value === undefined) {
    return undefined;
  }

  return value.length <= 200 && REF.test(value) ? value : new Error(`"${key}" is not a valid revision.`);
}

export function readBranchName(input: unknown, key: string): string | undefined | Error {
  const value = readStringArg(input, key);

  if (value === undefined) {
    return undefined;
  }

  const valid =
    value.length <= 100 && NAME.test(value) && !value.includes('..') && !value.endsWith('/') && !value.endsWith('.lock');

  return valid ? value : new Error(`"${key}" is not a valid branch name.`);
}

// A configured remote, by name. URLs and paths are not accepted.
export function readRemote(input: unknown, key: string): string | Error {
  const value = readStringArg(input, key) ?? 'origin';

  return value.length <= 100 && REMOTE.test(value) ? value : new Error(`"${key}" must be the name of a configured remote.`);
}

export function readCount(input: unknown, key: string, fallback: number, max: number): number | Error {
  const value = readNumberArg(input, key);

  if (value === undefined) {
    return fallback;
  }

  return value >= 1 && value <= max ? value : new Error(`"${key}" must be between 1 and ${max}.`);
}

export function readMessage(input: unknown, key: string): string | Error {
  const value = (input as Record<string, unknown> | null | undefined)?.[key];

  if (typeof value !== 'string' || !value.trim() || value.length > MAX_MESSAGE_CHARS || value.includes('\u0000')) {
    return new Error(`"${key}" must be a non-empty text of at most ${MAX_MESSAGE_CHARS} characters.`);
  }

  return value.trim();
}

export function readBoolean(input: unknown, key: string): boolean {
  const value = (input as Record<string, unknown> | null | undefined)?.[key];

  return value === true || value === 'true';
}

export function readRepositoryPaths(
  input: unknown,
  key: string,
  repository: string,
  required: boolean,
): RepositoryPaths | Error {
  const raw = (input as Record<string, unknown> | null | undefined)?.[key];
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : [];

  if (items.length === 0) {
    return required ? new Error(`"${key}" needs at least one path.`) : { absolute: [], pathspecs: [] };
  }

  if (items.length > MAX_PATHS) {
    return new Error(`"${key}" accepts at most ${MAX_PATHS} paths.`);
  }

  const absolute: string[] = [];
  const pathspecs: string[] = [];

  for (const item of items) {
    if (typeof item !== 'string' || !item.trim() || item.length > 500 || item.includes('\u0000')) {
      return new Error(`"${key}" holds an invalid path.`);
    }

    const resolved = resolvePath(item.trim());
    const relative = path.relative(repository, resolved.uri.fsPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Error(`"${item}" is outside the repository.`);
    }

    absolute.push(resolved.uri.fsPath);
    pathspecs.push(`:(literal)${relative === '' ? '.' : relative.split(path.sep).join('/')}`);
  }

  return { absolute, pathspecs };
}
