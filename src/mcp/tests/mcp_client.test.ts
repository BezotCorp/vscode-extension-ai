import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);

import { fakeVscode, openFolder } from '../../tools/tests/support/fake_vscode';
import { McpClient } from '../mcp_client';
import { McpRequestError } from '../mcp_request_error';

const server = { command: process.execPath, args: [path.join(__dirname, 'fake_mcp_server.cjs')] };
const clients: McpClient[] = [];

async function start(config = server, signal?: AbortSignal): Promise<McpClient> {
  const client = await McpClient.start(config, signal);

  clients.push(client);

  return client;
}

const kindOf = async (promise: Promise<unknown>) => (await promise.catch((error) => error)) as McpRequestError;

describe('McpClient', () => {
  beforeEach(() => {
    openFolder(process.cwd());
  });

  afterEach(() => {
    vi.useRealTimers();

    for (const client of clients.splice(0)) {
      client.dispose();
    }
  });

  it('starts a server, initializes it and lists its tools across pages', async () => {
    const client = await start();
    const tools = await client.listTools();

    expect(client.isClosed).toBe(false);
    expect(tools.map((tool) => tool.name)).toEqual([
      'echo',
      'fail',
      'rpc_invalid',
      'rpc_other',
      'hang',
      'die',
      'parts',
      'structured',
      'big_structured',
      'change',
      'replies',
      'a.b',
      'a_b',
    ]);
    expect(tools[0]).toMatchObject({ description: 'Echoes the text', inputSchema: { required: ['text'] } });
  });

  it('calls a tool and returns its text', async () => {
    const client = await start();

    expect(await client.callTool('echo', { text: 'hi' })).toEqual({
      text: 'echo: hi',
      isError: false,
      partTypes: ['text'],
      structuredContent: undefined,
    });
  });

  it('calls a tool without arguments', async () => {
    const client = await start();

    expect((await client.callTool('other', undefined)).text).toBe('ran other');
  });

  it('reports an error the tool announced as such', async () => {
    const client = await start();

    expect(await client.callTool('fail', {})).toMatchObject({ isError: true, text: 'it broke' });
  });

  it('describes each kind of content, without showing the data of an image or a sound', async () => {
    const client = await start();
    const result = await client.callTool('parts', {});

    expect(result.partTypes).toEqual(['text', 'resource', 'resource', 'image', 'audio', 'video', 'text']);
    expect(result.text.split('\n')).toEqual([
      'first',
      'resource text',
      '[resource file:///y]',
      '[image image/png, 4 base64 characters not shown]',
      '[audio audio/wav, 0 base64 characters not shown]',
      '[video]',
      '',
    ]);
  });

  it('returns structured content', async () => {
    const client = await start();

    expect((await client.callTool('structured', {})).structuredContent).toEqual({ answer: 42 });
  });

  it('turns a JSON-RPC error into a protocol error that keeps the code', async () => {
    const client = await start();
    const error = await kindOf(client.callTool('rpc_invalid', {}));

    expect(error).toBeInstanceOf(McpRequestError);
    expect(error).toMatchObject({ kind: 'protocol', code: -32602, message: 'invalid params' });
  });

  it('answers the requests of the server without honouring any but ping', async () => {
    const client = await start();
    const replies = JSON.parse((await client.callTool('replies', {})).text) as {
      id: string;
      result?: unknown;
      error?: { code: number };
    }[];

    expect(replies.find((reply) => reply.id === 'srv-ping')).toMatchObject({ result: {} });
    expect(replies.find((reply) => reply.id === 'srv-sampling')).toMatchObject({ error: { code: -32601 } });
  });

  it('ignores lines that are not JSON, answers nobody asked for, and notifications', async () => {
    const client = await start();

    expect((await client.callTool('echo', { text: 'still works' })).text).toBe('echo: still works');
  });

  it('notices that the server announced a change of its tools', async () => {
    const client = await start();

    expect(client.hasStaleTools).toBe(false);

    await client.callTool('change', {});

    expect(client.hasStaleTools).toBe(true);
    expect((await client.listTools()).map((tool) => tool.name)).toEqual(['after_change']);
  });

  it('cancels a call when the request is cancelled, and tells the server', async () => {
    const client = await start();
    const controller = new AbortController();
    const call = client.callTool('hang', {}, controller.signal);

    setTimeout(() => controller.abort(), 50);

    expect(await kindOf(call)).toMatchObject({ kind: 'cancelled' });
    expect((await client.callTool('echo', { text: 'after' })).text).toBe('echo: after');
  });

  it('gives up on a call the server never answers', async () => {
    const client = await start();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const call = kindOf(client.callTool('hang', {}));

    await vi.advanceTimersByTimeAsync(60_001);

    expect(await call).toMatchObject({ kind: 'timeout' });
    expect((await call).message).toContain('"tools/call" timed out after 60000 ms');
  });

  it('closes when the server exits, and says what it wrote on its error output', async () => {
    const client = await start();
    const error = await kindOf(client.callTool('die', {}));

    expect(error).toMatchObject({ kind: 'closed' });
    expect(error.message).toContain('MCP server exited (code 3).');
    expect(error.stderrTail).toBe('fatal: the server is dying');
    expect(client.isClosed).toBe(true);
    expect(await kindOf(client.callTool('echo', { text: 'x' }))).toMatchObject({ kind: 'not_running' });
  });

  it('refuses requests once stopped, and can be stopped twice', async () => {
    const client = await start();

    client.dispose();
    client.dispose();

    expect(client.isClosed).toBe(true);
    expect(await kindOf(client.listTools())).toMatchObject({ kind: 'not_running' });
  });

  it('fails to start a program that does not exist', async () => {
    await expect(McpClient.start({ command: path.join(__dirname, 'no-such-program') })).rejects.toMatchObject({
      kind: 'closed',
    });
  });

  it('gives the server a basic environment plus its own variables, not the editor environment', async () => {
    process.env.EDITOR_SECRET = 'must not leak';

    const client = await start({
      command: process.execPath,
      args: [
        '-e',
        `
        const readline = require('node:readline');
        readline.createInterface({ input: process.stdin }).on('line', (line) => {
          const message = JSON.parse(line);
          if (message.method === 'initialize') {
            process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\\n');
          } else if (message.method === 'tools/call') {
            const env = { secret: process.env.EDITOR_SECRET, own: process.env.OWN_VARIABLE, cwd: process.cwd() };
            process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(env) }] } }) + '\\n');
          }
        });
      `,
      ],
      env: { OWN_VARIABLE: 'given' },
    } as never);

    delete process.env.EDITOR_SECRET;

    expect(JSON.parse((await client.callTool('anything', {})).text)).toEqual({
      own: 'given',
      cwd: process.cwd(),
    });
  });

  it('starts in the folder given by its configuration, or else in the first folder of the window', async () => {
    const inFolder = (config: object) =>
      start({
        command: process.execPath,
        args: [
          '-e',
          `
          const readline = require('node:readline');
          readline.createInterface({ input: process.stdin }).on('line', (line) => {
            const message = JSON.parse(line);
            if (message.id !== undefined) {
              process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: process.cwd() }] } }) + '\\n');
            }
          });
        `,
        ],
        ...config,
      } as never);

    expect((await (await inFolder({})).callTool('x', {})).text).toBe(process.cwd());
    expect((await (await inFolder({ cwd: __dirname })).callTool('x', {})).text).toBe(__dirname);

    fakeVscode.workspace.workspaceFolders = undefined;
    expect((await (await inFolder({})).callTool('x', {})).text).toBe(process.cwd());
  });
});
