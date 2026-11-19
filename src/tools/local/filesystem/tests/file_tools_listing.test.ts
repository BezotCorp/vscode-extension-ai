import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../../tests/support/fake_vscode')).fakeVscode);
vi.mock('../../../../i18n', () => ({ t: (key: string) => key }));

import { PermissionError } from '../../../../permissions';
import { FakeUri, fakeVscode, openFolder } from '../../../tests/support/fake_vscode';
import type { ToolAccessGuard } from '../../../tool_access_guard';
import { FileVersionTracker } from '../file_version_tracker';
import { MAX_ENTRIES } from '../list_files_constants';
import { ListFilesTool } from '../list_files_tool';
import { ReadFileTool } from '../read_file_tool';
import { MAX_MATCHES } from '../search_text_limits';
import { SearchTextTool } from '../search_text_tool';

const guard = {
  assertReadable: vi.fn(async (..._args: unknown[]) => undefined),
  assertPath: vi.fn(async (..._args: unknown[]) => undefined),
};

let base: string;
let folder: string;

const list = () => new ListFilesTool(guard as unknown as ToolAccessGuard);
const search = () =>
  new SearchTextTool(
    guard as unknown as ToolAccessGuard,
    new ReadFileTool(guard as unknown as ToolAccessGuard, new FileVersionTracker()),
  );
const write = async (relative: string, content: string | Buffer) => {
  await fs.mkdir(path.dirname(path.join(folder, relative)), { recursive: true });
  await fs.writeFile(path.join(folder, relative), content);
};

describe('file tools that look around', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-listing-')));
    folder = path.join(base, 'ws');
    await fs.mkdir(folder);
    openFolder(folder);
    guard.assertReadable.mockReset();
    guard.assertPath.mockReset();
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  describe('list_files', () => {
    it('needs one explicit scope', async () => {
      for (const input of [{}, { all: true, paths: ['src'] }, { all: false }, { all: 'yes' }, { paths: [' '] }]) {
        expect(await list().execute(input)).toMatchObject({ reason: 'invalid_arguments', executed: false });
      }
    });

    it('lists folders first, then files, sorted, indented by depth', async () => {
      await write('src/b.ts', '');
      await write('src/a.ts', '');
      await write('src/lib/c.ts', '');
      await write('readme.md', '');

      const result = await list().execute({ paths: ['.'] });

      expect(result.content).toBe(
        ['./', '  src/', '    lib/', '      c.ts', '    a.ts', '    b.ts', '  readme.md'].join('\n'),
      );
      expect(result.details).toMatchObject({ scope: 'paths', entries: 6, truncated: false, includeIgnored: false });
    });

    it('lists the whole window under the name of its folder', async () => {
      await write('a.txt', '');

      const result = await list().execute({ all: true });

      expect(result.content).toBe(`${path.basename(folder)}/\n  a.txt`);
      expect(result.resource).toBe('current_window');
    });

    it('omits generated folders unless asked, and says which', async () => {
      await write('node_modules/x/index.js', '');
      await write('src/a.ts', '');

      const normal = await list().execute({ paths: ['.'] });
      const everything = await list().execute({ paths: ['.'], includeIgnored: true });

      expect(normal.content).not.toContain('node_modules');
      expect((normal.details as { ignoredDirectories: string[] }).ignoredDirectories).toContain('node_modules');
      expect(everything.content).toContain('node_modules/');
      expect((everything.details as { ignoredDirectories: string[] }).ignoredDirectories).toEqual([]);
    });

    it('does not walk into a symbolic link to a folder', async () => {
      await write('real/inner.txt', '');
      await fs.symlink(path.join(folder, 'real'), path.join(folder, 'link'));

      const content = (await list().execute({ paths: ['.'] })).content ?? '';

      expect(content).toContain('link/');
      expect(content.match(/inner\.txt/g)).toHaveLength(1);
    });

    it('lists each requested folder once and keeps its label', async () => {
      await write('a/x.txt', '');
      await write('b/y.txt', '');

      const result = await list().execute({ paths: ['a/', 'b', 'a/'] });

      expect(result.content).toBe('a/\n  x.txt\n\nb/\n  y.txt');
    });

    it('reports an empty folder', async () => {
      await fs.mkdir(path.join(folder, 'empty'));

      expect((await list().execute({ paths: ['empty'] })).content).toBe('empty/');
    });

    it('stops at the entry limit and says so', async () => {
      await fs.mkdir(path.join(folder, 'many'));
      await Promise.all(Array.from({ length: MAX_ENTRIES + 5 }, (_, index) => write(`many/f${index}.txt`, '')));

      const result = await list().execute({ paths: ['many'] });

      expect(result.details).toMatchObject({ entries: MAX_ENTRIES, truncated: true });
    });

    it('tells a missing folder from a file', async () => {
      await write('a.txt', '');

      expect(await list().execute({ paths: ['missing'] })).toMatchObject({ reason: 'not_found', retryable: true });
      expect(await list().execute({ paths: ['a.txt'] })).toMatchObject({ reason: 'not_a_directory' });
    });

    it('has nothing to list when no folder is open', async () => {
      fakeVscode.workspace.workspaceFolders = undefined;

      expect(await list().execute({ all: true })).toMatchObject({ reason: 'no_current_window' });
    });

    it('asks the guard for every folder it lists', async () => {
      await write('a/x.txt', '');

      await list().execute({ paths: ['a'] });

      expect(guard.assertReadable).toHaveBeenCalledTimes(1);
      expect(guard.assertReadable.mock.calls[0]?.[2]).toBe(true);
    });

    it('is cancelled before it lists anything when the request was cancelled', async () => {
      const controller = new AbortController();

      controller.abort();

      expect(await list().execute({ paths: ['.'] }, { signal: controller.signal })).toMatchObject({
        status: 'cancelled',
        executed: false,
      });
    });
  });

  describe('search_text', () => {
    it('needs a query', async () => {
      expect(await search().execute({ query: ' ' })).toMatchObject({ reason: 'invalid_arguments' });
    });

    it('finds matching lines without regard to case, with file and line number', async () => {
      await write('src/a.ts', 'first\n   The NEEDLE is here   \nlast');
      await write('src/b.ts', 'nothing');

      const result = await search().execute({ query: 'needle' });

      expect(result.content).toBe('src/a.ts:2: The NEEDLE is here');
      expect(result.details).toMatchObject({ matches: 1, filesScanned: 2, matchLimitReached: false });
    });

    it('reports when nothing matches', async () => {
      await write('a.txt', 'x');

      expect((await search().execute({ query: 'zzz' })).content).toBe('No matches found.');
    });

    it('restricts the files with a glob', async () => {
      await write('src/a.ts', 'needle');
      await write('docs/a.md', 'needle');

      expect((await search().execute({ query: 'needle', glob: 'src/**/*.ts' })).content).toBe('src/a.ts:1: needle');
    });

    it('skips generated folders unless asked', async () => {
      await write('node_modules/x.js', 'needle');

      expect((await search().execute({ query: 'needle' })).content).toBe('No matches found.');
      expect((await search().execute({ query: 'needle', includeIgnored: true })).content).toContain(
        'node_modules/x.js:1',
      );
    });

    it('skips a binary file and counts it', async () => {
      await write('bin.dat', Buffer.from([0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65, 0x00, 0x01]));

      const result = await search().execute({ query: 'needle' });

      expect(result.content).toBe('No matches found.');
      expect(result.details).toMatchObject({ filesScanned: 0, filesSkippedBinaryLargeOrUnreadable: 1 });
    });

    it('searches the unsaved content of an open editor', async () => {
      await write('a.ts', 'saved text');
      fakeVscode.workspace.textDocuments = [
        { uri: FakeUri.file(path.join(folder, 'a.ts')), isDirty: true, getText: () => 'edited needle text' },
      ];

      const result = await search().execute({ query: 'needle' });

      expect(result.content).toBe('a.ts:1: edited needle text');
      expect(result.details).toMatchObject({ filesFromEditorBuffers: 1 });
    });

    it('stops at the match limit and says so', async () => {
      await write('a.txt', Array.from({ length: MAX_MATCHES + 10 }, () => 'needle').join('\n'));

      const result = await search().execute({ query: 'needle' });

      expect(result.content?.split('\n')).toHaveLength(MAX_MATCHES);
      expect(result.details).toMatchObject({ matches: MAX_MATCHES, matchLimitReached: true });
    });

    it('tells the model which files the user refused to let it read, and goes on with the others', async () => {
      await write('secret.txt', 'needle');
      await write('open.txt', 'needle');
      guard.assertReadable.mockImplementation(async (_tool, resolved) => {
        if (String((resolved as { uri: { fsPath: string } }).uri.fsPath).endsWith('secret.txt')) {
          throw new PermissionError('user_refused', 'user_refused', 'no');
        }
      });

      const result = await search().execute({ query: 'needle' });

      expect(result.content).toContain('open.txt:1: needle');
      expect(result.content).toContain('1 file(s) were NOT searched');
      expect(result.content).toContain('secret.txt');
      expect(result.details).toMatchObject({ filesRefusedByUser: 1 });
    });

    it('lets any other refusal stop the search', async () => {
      await write('a.txt', 'needle');
      guard.assertReadable.mockRejectedValue(new PermissionError('policy', 'read_only_mode', 'no'));

      await expect(search().execute({ query: 'needle' })).rejects.toMatchObject({ reason: 'read_only_mode' });
    });

    it('is cancelled without reporting an incomplete result', async () => {
      await write('a.txt', 'needle');

      const controller = new AbortController();

      controller.abort();

      expect(await search().execute({ query: 'needle' }, { signal: controller.signal })).toMatchObject({
        status: 'cancelled',
        reason: 'cancelled_by_user',
      });
    });

    it('does not remember anything as seen by the model', async () => {
      const versions = new FileVersionTracker();
      const tool = new SearchTextTool(
        guard as unknown as ToolAccessGuard,
        new ReadFileTool(guard as unknown as ToolAccessGuard, versions),
      );

      await write('a.txt', 'needle');
      await tool.execute({ query: 'needle' });

      expect(versions.takeObservations()).toEqual([]);
      expect(versions.hasSeen(path.join(folder, 'a.txt'))).toBe(false);
    });
  });
});
