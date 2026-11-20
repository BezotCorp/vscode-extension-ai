import * as http from 'node:http';
import * as net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  editor: undefined as unknown,
  documents: [] as unknown[],
  protectedPaths: [] as string[],
}));

vi.mock('vscode', () => ({
  Uri: { parse: () => undefined },
  window: {
    get activeTextEditor() {
      return host.editor;
    },
  },
  workspace: {
    get textDocuments() {
      return host.documents;
    },
    get workspaceFolders() {
      return undefined;
    },
    getConfiguration: () => ({ inspect: () => ({ globalValue: host.protectedPaths }) }),
  },
}));

import { VSCODE_PORT } from '../bridge_ports';
import { createBridgeServer } from '../bridge_server';
import { isLocalProgramRequest } from '../request_guard';

type Reply = { status: number; body: unknown; contentType?: string };

function request(
  port: number,
  urlPath: string,
  headers: http.OutgoingHttpHeaders = {},
  method = 'GET',
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      let text = '';

      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: JSON.parse(text), contentType: res.headers['content-type'] }),
      );
    });

    req.on('error', reject);
    req.end();
  });
}

async function listening(runtime: ReturnType<typeof createBridgeServer>): Promise<number> {
  for (let attempt = 0; attempt < 100 && runtime.port === undefined; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  if (runtime.port === undefined) {
    throw new Error('the bridge did not start');
  }

  return runtime.port;
}

const document = (fsPath: string, text: string, extra: object = {}) => ({
  uri: { scheme: 'file', fsPath },
  isUntitled: false,
  getText: () => text,
  ...extra,
});

describe('isLocalProgramRequest', () => {
  const ask = (headers: http.IncomingHttpHeaders) => isLocalProgramRequest({ headers } as http.IncomingMessage);

  it('accepts a request to a loopback address, with or without a port', () => {
    expect(ask({ host: '127.0.0.1:4190' })).toBe(true);
    expect(ask({ host: 'localhost' })).toBe(true);
    expect(ask({ host: 'LOCALHOST:80' })).toBe(true);
    expect(ask({ host: '[::1]:4190' })).toBe(true);
  });

  it('refuses a request a browser made on behalf of a web page', () => {
    expect(ask({ host: '127.0.0.1:4190', origin: 'https://evil.example' })).toBe(false);
    expect(ask({ host: '127.0.0.1:4190', origin: '' })).toBe(false);
  });

  it('refuses a Host that is not the loopback address, as in DNS rebinding', () => {
    expect(ask({ host: 'evil.example:4190' })).toBe(false);
    expect(ask({ host: '127.0.0.1.evil.example' })).toBe(false);
    expect(ask({ host: 'localhost.evil.example' })).toBe(false);
    expect(ask({ host: '127.0.0.1:abc' })).toBe(false);
    expect(ask({})).toBe(false);
  });
});

describe('the bridge server', () => {
  let runtime: ReturnType<typeof createBridgeServer>;
  let port: number;

  beforeEach(async () => {
    host.editor = undefined;
    host.documents = [];
    host.protectedPaths = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runtime = createBridgeServer();
    port = await listening(runtime);
  });

  afterEach(() => {
    runtime.dispose();
    vi.restoreAllMocks();
  });

  it('listens on the loopback address, from the first free port', () => {
    expect(port).toBeGreaterThanOrEqual(VSCODE_PORT);
    expect((runtime.server.address() as net.AddressInfo).address).toBe('127.0.0.1');
  });

  it('answers in JSON', async () => {
    expect((await request(port, '/nothing')).contentType).toBe('application/json');
  });

  it('refuses a request that does not come from a program on this machine, for any route', async () => {
    for (const urlPath of ['/active-file', '/open-files', '/nothing']) {
      expect(await request(port, urlPath, { origin: 'https://evil.example' })).toMatchObject({
        status: 403,
        body: { error: 'forbidden' },
      });
      expect(await request(port, urlPath, { host: 'evil.example' })).toMatchObject({ status: 403 });
    }
  });

  it('does not know any other route or method', async () => {
    expect(await request(port, '/nothing')).toMatchObject({ status: 404, body: { error: 'not found' } });
    expect(await request(port, '/active-file', {}, 'POST')).toMatchObject({ status: 404 });
    expect(await request(port, '/active-file?x=1')).toMatchObject({ status: 404 });
  });

  describe('/active-file', () => {
    it('says when there is no active file', async () => {
      expect(await request(port, '/active-file')).toMatchObject({ status: 404, body: { error: 'no active file' } });
    });

    it('returns the path and the content of the active file', async () => {
      host.editor = { document: document('/w/a.ts', 'const a = 1;') };

      expect(await request(port, '/active-file')).toMatchObject({
        status: 200,
        body: { path: '/w/a.ts', content: 'const a = 1;' },
      });
    });

    it('does not return the content of a protected file, and says why', async () => {
      host.editor = { document: document('/w/.env', 'SECRET=1') };

      const reply = await request(port, '/active-file');

      expect(reply.status).toBe(403);
      expect(reply.body).toEqual({ error: 'this file is a protected resource', path: '/w/.env', protected: true });
    });
  });

  describe('/open-files', () => {
    it('returns the local files that are open, with their content, and only the path of a protected one', async () => {
      host.documents = [
        document('/w/a.ts', 'a'),
        document('/w/.env', 'SECRET=1'),
        document('/w/untitled', 'x', { isUntitled: true }),
        { ...document('/remote/b.ts', 'b'), uri: { scheme: 'vscode-vfs', fsPath: '/remote/b.ts' } },
      ];

      expect(await request(port, '/open-files')).toMatchObject({
        status: 200,
        body: {
          files: [
            { path: '/w/a.ts', content: 'a' },
            { path: '/w/.env', protected: true },
          ],
        },
      });
    });

    it('returns an empty list when nothing is open', async () => {
      expect((await request(port, '/open-files')).body).toEqual({ files: [] });
    });
  });

  it('stops listening when disposed, and can be disposed twice', async () => {
    runtime.dispose();
    runtime.dispose();

    await expect(request(port, '/open-files')).rejects.toThrow();
  });

  it('tries the next port when the first is taken, so several windows can each have a bridge', async () => {
    const second = createBridgeServer();
    const secondPort = await listening(second);

    expect(secondPort).not.toBe(port);

    second.dispose();
  });

  it('gives up with an error, without crashing, when no port is free', async () => {
    const blockers: net.Server[] = [];

    try {
      for (let offset = 0; offset < 20; offset++) {
        const blocker = net.createServer();

        await new Promise<void>((resolve) => {
          blocker.once('error', () => resolve());
          blocker.listen(VSCODE_PORT + offset, '127.0.0.1', () => resolve());
        });
        blockers.push(blocker);
      }

      const none = createBridgeServer();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(none.port).toBeUndefined();
      expect(console.error).toHaveBeenCalled();
      none.dispose();
    } finally {
      for (const blocker of blockers) {
        blocker.close();
      }
    }
  });
});
