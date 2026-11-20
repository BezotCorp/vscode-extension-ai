import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../../tests/support/fake_vscode')).fakeVscode);

import { openFolder } from '../../../tests/support/fake_vscode';
import { MAX_MESSAGE_CHARS, MAX_PATHS } from '../git_argument_constants';
import {
  readBoolean,
  readBranchName,
  readCount,
  readMessage,
  readRemote,
  readRepositoryPaths,
  readRevision,
} from '../git_arguments';

describe('readRevision', () => {
  it('accepts ordinary revisions and ranges', () => {
    for (const value of ['HEAD', 'HEAD~2', 'main..feature', 'v1.2.3', 'origin/main', 'a1b2c3d', 'HEAD@{1}', 'main^']) {
      expect(readRevision({ r: value }, 'r')).toBe(value);
    }
  });

  it('has no revision when none is given', () => {
    expect(readRevision({}, 'r')).toBeUndefined();
    expect(readRevision({ r: '  ' }, 'r')).toBeUndefined();
  });

  it('refuses what could become an option, read a file at a revision, or hold a space', () => {
    for (const value of ['--output=/tmp/x', '-p', 'HEAD:secret.env', 'a b', 'x;y', '.hidden', 'a'.repeat(201)]) {
      expect(readRevision({ r: value }, 'r')).toBeInstanceOf(Error);
    }
  });
});

describe('readBranchName', () => {
  it('accepts ordinary branch names', () => {
    for (const value of ['main', 'feature/login', 'fix-1.2', 'release_3']) {
      expect(readBranchName({ b: value }, 'b')).toBe(value);
    }
  });

  it('has no name when none is given', () => {
    expect(readBranchName({}, 'b')).toBeUndefined();
  });

  it('refuses names git or the command line would misread', () => {
    for (const value of ['-d', 'a..b', 'ends/', 'x.lock', 'with space', 'a:b', 'x'.repeat(101), '/abs']) {
      expect(readBranchName({ b: value }, 'b')).toBeInstanceOf(Error);
    }
  });
});

describe('readRemote', () => {
  it('defaults to origin and accepts the name of a remote', () => {
    expect(readRemote({}, 'remote')).toBe('origin');
    expect(readRemote({ remote: 'upstream' }, 'remote')).toBe('upstream');
  });

  it('refuses a URL, a path, or an option', () => {
    for (const value of ['https://example.com/x.git', '../x', '-o', 'git@host:x', 'a b']) {
      expect(readRemote({ remote: value }, 'remote')).toBeInstanceOf(Error);
    }
  });
});

describe('readCount', () => {
  it('uses the fallback when absent and accepts a value in range', () => {
    expect(readCount({}, 'n', 20, 100)).toBe(20);
    expect(readCount({ n: 5 }, 'n', 20, 100)).toBe(5);
    expect(readCount({ n: '7' }, 'n', 20, 100)).toBe(7);
    expect(readCount({ n: 100 }, 'n', 20, 100)).toBe(100);
  });

  it('refuses a value out of range', () => {
    expect(readCount({ n: 0 }, 'n', 20, 100)).toBeInstanceOf(Error);
    expect(readCount({ n: 101 }, 'n', 20, 100)).toBeInstanceOf(Error);
    expect(readCount({ n: -3 }, 'n', 20, 100)).toBeInstanceOf(Error);
  });
});

describe('readMessage', () => {
  it('returns the trimmed message', () => {
    expect(readMessage({ message: '  fix: a bug \n' }, 'message')).toBe('fix: a bug');
  });

  it('refuses an empty, non-text, null-containing or too long message', () => {
    for (const value of ['', '   ', 3, undefined, 'a\u0000b', 'x'.repeat(MAX_MESSAGE_CHARS + 1)]) {
      expect(readMessage({ message: value }, 'message')).toBeInstanceOf(Error);
    }
  });

  it('accepts a message of the largest size', () => {
    expect(readMessage({ message: 'x'.repeat(MAX_MESSAGE_CHARS) }, 'message')).toHaveLength(MAX_MESSAGE_CHARS);
  });
});

describe('readBoolean', () => {
  it('is true only for true or "true"', () => {
    expect(readBoolean({ a: true }, 'a')).toBe(true);
    expect(readBoolean({ a: 'true' }, 'a')).toBe(true);
    expect(readBoolean({ a: 'yes' }, 'a')).toBe(false);
    expect(readBoolean({ a: 1 }, 'a')).toBe(false);
    expect(readBoolean({}, 'a')).toBe(false);
    expect(readBoolean(null, 'a')).toBe(false);
  });
});

describe('readRepositoryPaths', () => {
  let base: string;
  let repository: string;

  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-gitargs-')));
    repository = path.join(base, 'repo');
    await fs.mkdir(repository);
    openFolder(repository);
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('turns paths into absolute paths and literal pathspecs relative to the repository', async () => {
    const paths = await readRepositoryPaths({ paths: ['src/a.ts', '.'] }, 'paths', repository, true);

    expect(paths).toEqual({
      absolute: [path.join(repository, 'src', 'a.ts'), repository],
      pathspecs: [':(literal)src/a.ts', ':(literal).'],
    });
  });

  it('accepts a single path given as a string', async () => {
    expect(await readRepositoryPaths({ paths: 'a.ts' }, 'paths', repository, true)).toMatchObject({
      pathspecs: [':(literal)a.ts'],
    });
  });

  it('may be empty when paths are optional, and refuses it when they are required', async () => {
    expect(await readRepositoryPaths({}, 'paths', repository, false)).toEqual({ absolute: [], pathspecs: [] });
    expect(await readRepositoryPaths({ paths: [] }, 'paths', repository, true)).toBeInstanceOf(Error);
  });

  it('refuses a path outside the repository', async () => {
    const outside = await readRepositoryPaths({ paths: ['../elsewhere'] }, 'paths', repository, true);

    expect(outside).toBeInstanceOf(Error);
    expect((outside as Error).message).toContain('outside the repository');
    expect(await readRepositoryPaths({ paths: [base] }, 'paths', repository, true)).toBeInstanceOf(Error);
  });

  it('keeps a pathspec literal, so a name that looks like a magic pathspec is just a name', async () => {
    const paths = await readRepositoryPaths({ paths: [':(top)x', '*.ts'] }, 'paths', repository, true);

    expect((paths as { pathspecs: string[] }).pathspecs).toEqual([':(literal):(top)x', ':(literal)*.ts']);
  });

  it('refuses too many paths, and invalid entries', async () => {
    const many = Array.from({ length: MAX_PATHS + 1 }, (_, index) => `f${index}`);

    expect(await readRepositoryPaths({ paths: many }, 'paths', repository, true)).toBeInstanceOf(Error);

    for (const bad of [3, '', '   ', 'a\u0000b', 'x'.repeat(501)]) {
      expect(await readRepositoryPaths({ paths: [bad] }, 'paths', repository, true)).toBeInstanceOf(Error);
    }
  });

  it('refuses a resource that is not a filesystem path', async () => {
    const result = await readRepositoryPaths({ paths: ['vscode-vfs://github/o/r/a.ts'] }, 'paths', repository, true);

    expect((result as Error).message).toContain('not available to git');
  });
});
