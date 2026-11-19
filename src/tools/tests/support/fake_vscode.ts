// A stand-in for the `vscode` module in tests: just enough of Uri, workspace.fs, workspace folders and open documents
// for the file tools to run against a real temporary folder. It is not compiled with the extension (see tsconfig).
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class FakeUri {
  constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query = '',
    readonly fragment = '',
  ) {}

  get fsPath(): string {
    return this.path;
  }

  static file(target: string): FakeUri {
    return new FakeUri('file', '', target.replace(/\\/g, '/'));
  }

  static parse(value: string): FakeUri {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value);

    if (!match) {
      throw new Error(`Cannot parse ${value}`);
    }

    return new FakeUri(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? '', match[5] ?? '');
  }

  static joinPath(base: FakeUri, ...segments: string[]): FakeUri {
    return base.with({ path: path.posix.join(base.path, ...segments) });
  }

  with(change: { path?: string; query?: string; fragment?: string }): FakeUri {
    return new FakeUri(
      this.scheme,
      this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }
}

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };

function typeOf(stats: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): number {
  return (stats.isFile() ? 1 : 0) | (stats.isDirectory() ? 2 : 0) | (stats.isSymbolicLink() ? 64 : 0);
}

const nodeFs = {
  readFile: async (uri: FakeUri) => new Uint8Array(await fs.readFile(uri.fsPath)),
  writeFile: async (uri: FakeUri, content: Uint8Array) => fs.writeFile(uri.fsPath, content),
  stat: async (uri: FakeUri) => {
    const stats = await fs.stat(uri.fsPath);

    return { type: typeOf(stats), size: stats.size, ctime: stats.ctimeMs, mtime: stats.mtimeMs };
  },
  createDirectory: async (uri: FakeUri) => {
    await fs.mkdir(uri.fsPath, { recursive: true });
  },
  rename: async (from: FakeUri, to: FakeUri, options?: { overwrite?: boolean }) => {
    if (!options?.overwrite) {
      const exists = await fs.stat(to.fsPath).then(
        () => true,
        () => false,
      );

      if (exists) {
        throw Object.assign(new Error('exists'), { code: 'FileExists' });
      }
    }

    await fs.rename(from.fsPath, to.fsPath);
  },
  delete: async (uri: FakeUri, options?: { recursive?: boolean }) => {
    await fs.rm(uri.fsPath, { recursive: options?.recursive ?? false, force: false });
  },
  // Like VS Code, a link to a folder is reported as both a folder and a link.
  readDirectory: async (uri: FakeUri) =>
    Promise.all(
      (await fs.readdir(uri.fsPath, { withFileTypes: true })).map(async (entry) => {
        let type = typeOf(entry);

        if (entry.isSymbolicLink()) {
          const target = await fs.stat(path.join(uri.fsPath, entry.name)).catch(() => undefined);

          type |= target ? typeOf(target) & ~64 : 0;
        }

        return [entry.name, type] as const;
      }),
    ),
  copy: async (from: FakeUri, to: FakeUri, options?: { overwrite?: boolean }) => {
    await fs.cp(from.fsPath, to.fsPath, { recursive: true, force: options?.overwrite ?? false });
  },
};

const IGNORED = new Set(['.cache', '.git', '.next', 'build', 'coverage', 'dist', 'node_modules', 'out', 'target']);

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => {
      if (part === '**/') {
        return '(?:.*/)?';
      }

      if (part === '**') {
        return '.*';
      }

      return part === '*' ? '[^/]*' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');

  return new RegExp(`^${body}$`);
}

async function listFiles(directory: string, root: string, skipIgnored: boolean, found: string[]): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (skipIgnored && entry.isDirectory() && IGNORED.has(entry.name)) {
      continue;
    }

    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await listFiles(full, root, skipIgnored, found);
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
}

export type FakeDocument = {
  uri: FakeUri;
  isDirty: boolean;
  getText(): string;
};

export const fakeVscode = {
  Uri: FakeUri,
  FileType,
  ConfigurationTarget: { Global: 1 },
  QuickPickItemKind: { Separator: -1 },
  workspace: {
    fs: nodeFs,
    isTrusted: true,
    workspaceFolders: undefined as { uri: FakeUri; name: string; index: number }[] | undefined,
    textDocuments: [] as FakeDocument[],
    getConfiguration: () => ({ inspect: () => undefined, update: async () => undefined }),
    // A simplified findFiles: every file of the folders of the window that matches the glob, ignored folders skipped
    // when an exclusion is given.
    findFiles: async (glob: string, exclude?: string, maxResults?: number) => {
      const matcher = globToRegExp(glob);
      const found: FakeUri[] = [];

      for (const folder of fakeVscode.workspace.workspaceFolders ?? []) {
        const files: string[] = [];

        await listFiles(folder.uri.fsPath, folder.uri.fsPath, exclude !== undefined, files);

        for (const file of files) {
          if (matcher.test(path.relative(folder.uri.fsPath, file).replace(/\\/g, '/'))) {
            found.push(FakeUri.file(file));
          }
        }
      }

      return found.slice(0, maxResults);
    },
    asRelativePath: (uri: FakeUri) => {
      const folder = fakeVscode.workspace.workspaceFolders?.[0];

      return folder ? path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/') : uri.fsPath;
    },
  },
  window: {
    messages: [] as string[],
    showWarningMessage: async (message: string) => {
      fakeVscode.window.messages.push(message);
    },
    showErrorMessage: async (message: string) => {
      fakeVscode.window.messages.push(message);
    },
  },
};

// Opens `folder` as the only folder of the window and forgets documents and messages of earlier tests.
export function openFolder(folder: string): void {
  fakeVscode.workspace.workspaceFolders = [{ uri: FakeUri.file(folder), name: path.basename(folder), index: 0 }];
  fakeVscode.workspace.textDocuments = [];
  fakeVscode.window.messages = [];
  fakeVscode.workspace.isTrusted = true;
}
