import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);

import { FakeUri, fakeVscode, openFolder } from '../../tools/tests/support/fake_vscode';
import { findDirtyDocuments, findOpenDocument } from '../open_document';

let base: string;

function document(target: string, isDirty: boolean, scheme = 'file') {
  return { uri: new FakeUri(scheme, '', target), isDirty, getText: () => '' };
}

describe('open documents', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-docs-')));
    openFolder(base);
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  describe('findOpenDocument', () => {
    it('finds the document open at that path', () => {
      const open = document(path.join(base, 'a.ts'), false);

      fakeVscode.workspace.textDocuments = [document(path.join(base, 'b.ts'), false), open];

      expect(findOpenDocument(FakeUri.file(path.join(base, 'a.ts')) as never)).toBe(open);
    });

    it('finds nothing for a file that is not open, or for a document that is not a local file', () => {
      fakeVscode.workspace.textDocuments = [document(path.join(base, 'a.ts'), false, 'untitled')];

      expect(findOpenDocument(FakeUri.file(path.join(base, 'a.ts')) as never)).toBeUndefined();
    });

    it('recognizes the same file through a symbolic link', async () => {
      await fs.writeFile(path.join(base, 'real.ts'), 'x');
      await fs.symlink(path.join(base, 'real.ts'), path.join(base, 'link.ts'));

      const open = document(path.join(base, 'real.ts'), false);

      fakeVscode.workspace.textDocuments = [open];

      expect(findOpenDocument(FakeUri.file(path.join(base, 'link.ts')) as never)).toBe(open);
    });
  });

  describe('findDirtyDocuments', () => {
    it('finds a document with unsaved changes at the path itself', () => {
      const dirty = document(path.join(base, 'a.ts'), true);

      fakeVscode.workspace.textDocuments = [dirty, document(path.join(base, 'b.ts'), false)];

      expect(findDirtyDocuments(FakeUri.file(path.join(base, 'a.ts')) as never)).toEqual([dirty]);
    });

    it('finds the documents with unsaved changes below a folder, and only those', async () => {
      await fs.mkdir(path.join(base, 'dir'));

      const inside = document(path.join(base, 'dir', 'a.ts'), true);

      fakeVscode.workspace.textDocuments = [
        inside,
        document(path.join(base, 'dir', 'saved.ts'), false),
        document(path.join(base, 'dir-other', 'a.ts'), true),
        document(path.join(base, 'a.ts'), true),
      ];

      expect(findDirtyDocuments(FakeUri.file(path.join(base, 'dir')) as never)).toEqual([inside]);
    });

    it('ignores a dirty document that is not a local file', () => {
      fakeVscode.workspace.textDocuments = [document(path.join(base, 'a.ts'), true, 'untitled')];

      expect(findDirtyDocuments(FakeUri.file(base) as never)).toEqual([]);
    });
  });
});
