import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import { PermissionError } from '../../permissions';
import { openFolder } from '../../tools/tests/support/fake_vscode';
import type { ToolAccessGuard } from '../../tools/tool_access_guard';
import { McpClient } from '../mcp_client';
import { McpTool, mcpToolId } from '../mcp_tool';
import type { McpToolInfo } from '../mcp_tool_info';
import { MAX_DESCRIPTION_CHARS } from '../mcp_tool_limits';

const guard = { authorize: vi.fn(async (..._args: unknown[]) => undefined) };
const asGuard = () => guard as unknown as ToolAccessGuard;
const clients: McpClient[] = [];

async function connect(): Promise<McpClient> {
  const client = await McpClient.start({
    command: process.execPath,
    args: [path.join(__dirname, 'fake_mcp_server.cjs')],
  });

  clients.push(client);

  return client;
}

const tool = (client: McpClient, name: string, info: Partial<McpToolInfo> = {}) =>
  new McpTool('srv', { name, ...info }, client, asGuard());

describe('mcpToolId', () => {
  it('builds an id from the server and the tool, with only characters a model accepts', () => {
    expect(mcpToolId('srv', 'echo')).toBe('mcp__srv__echo');
    expect(mcpToolId('my server', 'a.b/c')).toBe('mcp__my_server__a_b_c');
  });

  it('keeps the id within 64 characters', () => {
    expect(mcpToolId('s', 'x'.repeat(100))).toHaveLength(64);
  });
});

describe('McpTool', () => {
  beforeEach(() => {
    openFolder(process.cwd());
    guard.authorize.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();

    for (const client of clients.splice(0)) {
      client.dispose();
    }
  });

  describe('what it says about itself', () => {
    it('is never offered in read-only mode, asks by default, needs a trusted workspace, and has its own permission key', async () => {
      const client = await connect();
      const mcp = tool(client, 'echo', { description: 'Echoes' });

      expect(mcp).toMatchObject({
        id: 'mcp__srv__echo',
        permissionKey: 'mcp__srv__echo',
        name: 'srv: echo',
        description: '[MCP srv] Echoes',
        readOnlyCompatible: false,
        permissionDefault: 'ask',
        requiresTrust: true,
      });
    });

    it('keeps the real name of the tool in its permission key whatever its id became', async () => {
      const client = await connect();
      const mcp = new McpTool('srv', { name: 'a.b' }, client, asGuard(), 'mcp__srv__a_b_2');

      expect(mcp.id).toBe('mcp__srv__a_b_2');
      expect(mcp.permissionKey).toBe('mcp__srv__a.b');
    });

    it('describes itself by its name when the server gives no description, and cuts a long one', async () => {
      const client = await connect();

      expect(tool(client, 'bare').description).toBe('[MCP srv] bare');
      expect(tool(client, 'long', { description: 'd'.repeat(5_000) }).description).toBe(
        `[MCP srv] ${'d'.repeat(MAX_DESCRIPTION_CHARS)}`,
      );
    });

    it('takes its parameters from the input schema of the server, and has none without one', async () => {
      const client = await connect();

      expect(
        tool(client, 'echo', { inputSchema: { properties: { text: { type: 'string' } }, required: ['text'] } })
          .parameters,
      ).toEqual({ type: 'object', properties: { text: { type: 'string' } }, required: ['text'] });
      expect(tool(client, 'bare').parameters).toEqual({ type: 'object', properties: {}, required: undefined });
    });
  });

  describe('execute', () => {
    it('asks the guard before anything is sent, naming the tool and its arguments', async () => {
      const client = await connect();

      await tool(client, 'echo').execute({ text: 'hi\nthere' });

      const request = guard.authorize.mock.calls[0]?.[0] as { action: string; detail: string; resources: unknown[] };

      expect(request.action).toBe('call the MCP tool srv/echo');
      expect(request.detail).toContain('detail.arguments');
      expect(request.detail).toContain('hi');
      expect(request.resources).toEqual([]);
    });

    it('does not call the server when the guard refuses', async () => {
      const client = await connect();
      const call = vi.spyOn(client, 'callTool');

      guard.authorize.mockRejectedValueOnce(new PermissionError('user_refused', 'user_refused', 'no'));

      await expect(tool(client, 'echo').execute({ text: 'x' })).rejects.toBeInstanceOf(PermissionError);
      expect(call).not.toHaveBeenCalled();
    });

    it('returns the text and the facts about the content', async () => {
      const client = await connect();

      expect(await tool(client, 'echo').execute({ text: 'hi' })).toMatchObject({
        status: 'success',
        resource: 'srv/echo',
        content: 'echo: hi',
        details: { server: 'srv', tool: 'echo', contentParts: ['text'], truncated: false },
      });
    });

    it('cuts a text that is too long for the context', async () => {
      const client = await connect();

      vi.spyOn(client, 'callTool').mockResolvedValueOnce({
        text: 'x'.repeat(50_000),
        isError: false,
        partTypes: ['text'],
      });

      const result = await tool(client, 'echo').execute({});

      expect(result.details?.truncated).toBe(true);
      expect(result.content).toContain('Content truncated');
    });

    it('keeps structured content that is small, and only says how large it was when it is not', async () => {
      const client = await connect();

      expect((await tool(client, 'structured').execute({})).details?.structuredContent).toEqual({ answer: 42 });

      const big = await tool(client, 'big_structured').execute({});

      expect(big.details).not.toHaveProperty('structuredContent');
      expect(String(big.details?.structuredContentOmitted)).toContain('over the 8000 limit');
    });

    it('reports an error the server announced as such, with its text', async () => {
      const client = await connect();

      expect(await tool(client, 'fail').execute({})).toMatchObject({
        status: 'error',
        reason: 'mcp_tool_error',
        executed: true,
        retryable: false,
        content: 'it broke',
      });
    });

    it('reports a rejection before execution as not executed, and any other protocol error as unknown', async () => {
      const client = await connect();

      expect(await tool(client, 'rpc_invalid').execute({})).toMatchObject({
        reason: 'mcp_protocol_error',
        executed: false,
        details: { code: -32602 },
      });
      expect(await tool(client, 'rpc_other').execute({})).toMatchObject({
        reason: 'mcp_protocol_error',
        executed: 'unknown',
        details: { code: -1 },
      });
    });

    it('reports a server that exited as interrupted, with what it wrote on its error output', async () => {
      const client = await connect();
      const result = await tool(client, 'die').execute({});

      expect(result).toMatchObject({
        status: 'interrupted',
        reason: 'mcp_server_exited',
        executed: 'unknown',
        details: { stderr: 'fatal: the server is dying' },
      });
      expect(result.message).toContain('The tool may have partially run.');
    });

    it('says the server is not running once it has stopped, and that nothing ran', async () => {
      const client = await connect();

      client.dispose();

      expect(await tool(client, 'echo').execute({ text: 'x' })).toMatchObject({
        status: 'error',
        reason: 'mcp_server_not_running',
        executed: false,
      });
    });

    it('reports a cancelled call, which may have partly run', async () => {
      const client = await connect();
      const controller = new AbortController();
      const running = tool(client, 'hang').execute({}, { signal: controller.signal });

      setTimeout(() => controller.abort(), 50);

      expect(await running).toMatchObject({ status: 'cancelled', reason: 'cancelled_by_user', executed: true });
    });

    it('reports a call that got no answer in time as unknown, since the tool may still have run', async () => {
      const client = await connect();

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = tool(client, 'hang').execute({});

      await vi.advanceTimersByTimeAsync(60_001);

      expect(await running).toMatchObject({ status: 'unknown', reason: 'mcp_timeout', executed: true });
    });

    it('lets an error that is not an MCP error out, for the registry to report', async () => {
      const client = await connect();

      vi.spyOn(client, 'callTool').mockRejectedValueOnce(new TypeError('bug'));

      await expect(tool(client, 'echo').execute({})).rejects.toThrow('bug');
    });
  });
});
