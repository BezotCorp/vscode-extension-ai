import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('../../tools/tests/support/fake_vscode')).fakeVscode);
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import { fakeVscode, openFolder } from '../../tools/tests/support/fake_vscode';
import type { ToolAccessGuard } from '../../tools/tool_access_guard';
import { McpClient } from '../mcp_client';
import { McpManager } from '../mcp_manager';
import { IDLE_CHECK_MS, IDLE_STOP_MS, RETRY_AFTER_FAILURE_MS } from '../mcp_manager_limits';
import type { McpServerConfig } from '../mcp_server_config';

const guard = { authorize: vi.fn(async (..._args: unknown[]) => undefined) } as unknown as ToolAccessGuard;
const fakeServer: McpServerConfig = { command: process.execPath, args: [path.join(__dirname, 'fake_mcp_server.cjs')] };

let configs: Record<string, McpServerConfig>;
let manager: McpManager;

describe('McpManager', () => {
  beforeEach(() => {
    openFolder(process.cwd());
    configs = { srv: fakeServer };
    manager = new McpManager(() => configs);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.dispose();
    vi.restoreAllMocks();
  });

  describe('createTools', () => {
    it('starts the configured servers and wraps their tools, each with the identity of its server', async () => {
      const tools = await manager.createTools(guard);

      expect(tools).toHaveLength(13);
      expect(tools.map((tool) => tool.id).slice(0, 2)).toEqual(['mcp__srv__echo', 'mcp__srv__fail']);
      expect(tools[0]).toMatchObject({ name: 'srv: echo', permissionKey: 'mcp__srv__echo', permissionDefault: 'ask' });
    });

    it('gives distinct ids to tools whose sanitized names collide, and keeps their own permission keys', async () => {
      const tools = await manager.createTools(guard);
      const ids = tools.map((tool) => tool.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('mcp__srv__a_b');
      expect(ids).toContain('mcp__srv__a_b_2');
      expect(tools.find((tool) => tool.id === 'mcp__srv__a_b_2')?.permissionKey).toBe('mcp__srv__a_b');
    });

    it('runs a tool of the server through the tool it created', async () => {
      const tools = await manager.createTools(guard);

      expect(await tools[0]?.execute({ text: 'hi' })).toMatchObject({ status: 'success', content: 'echo: hi' });
    });

    it('reuses a running server instead of starting another', async () => {
      const start = vi.spyOn(McpClient, 'start');

      await manager.createTools(guard);
      await manager.createTools(guard);

      expect(start).toHaveBeenCalledTimes(1);
    });

    it('offers nothing when no server is configured', async () => {
      configs = {};

      expect(await manager.createTools(guard)).toEqual([]);
    });

    it('offers nothing, and stops what runs, in a workspace that is not trusted', async () => {
      await manager.createTools(guard);

      fakeVscode.workspace.isTrusted = false;

      expect(await manager.createTools(guard)).toEqual([]);
      expect(await manager.describeTools()).toEqual([]);

      fakeVscode.workspace.isTrusted = true;

      expect(await manager.createTools(guard)).toHaveLength(13);
    });

    it('refreshes the tools of a server that announced a change', async () => {
      const tools = await manager.createTools(guard);

      await tools.find((tool) => tool.id === 'mcp__srv__change')?.execute({});

      expect((await manager.createTools(guard)).map((tool) => tool.id)).toEqual(['mcp__srv__after_change']);
    });
  });

  describe('describeTools', () => {
    it('lists the tools with the key their permission is kept under, and a short description', async () => {
      const described = await manager.describeTools();

      expect(described).toHaveLength(13);
      expect(described[0]).toEqual({
        permissionKey: 'mcp__srv__echo',
        server: 'srv',
        name: 'echo',
        description: 'Echoes the text',
      });
      expect(described.map((tool) => tool.permissionKey)).toContain('mcp__srv__a.b');
    });
  });

  describe('a server that cannot be started', () => {
    it('is reported to the user, and not started again at the next message', async () => {
      configs = { broken: { command: path.join(__dirname, 'no-such-program') } };

      expect(await manager.createTools(guard)).toEqual([]);
      expect(fakeVscode.window.messages).toHaveLength(1);
      expect(fakeVscode.window.messages[0]).toContain('notify.mcpFailed');
      expect(fakeVscode.window.messages[0]).toContain('"name":"broken"');

      await manager.createTools(guard);

      expect(fakeVscode.window.messages).toHaveLength(1);
    });

    it('is tried again after a while, without telling the user a second time about the same failure', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      configs = { broken: { command: path.join(__dirname, 'no-such-program') } };

      await manager.createTools(guard);
      vi.setSystemTime(Date.now() + RETRY_AFTER_FAILURE_MS + 1_000);
      await manager.createTools(guard);

      expect(console.error).toHaveBeenCalledTimes(2);
      expect(fakeVscode.window.messages).toHaveLength(1);
    });

    it('is tried again at once when its configuration changed, and the user is told again', async () => {
      configs = { broken: { command: path.join(__dirname, 'no-such-program') } };
      await manager.createTools(guard);

      configs = { broken: { command: path.join(__dirname, 'another-missing-program') } };
      await manager.createTools(guard);

      expect(fakeVscode.window.messages).toHaveLength(2);
    });

    it('is refused when its name could be mistaken for a separator, or it has no command', async () => {
      configs = {
        'a/b': fakeServer,
        a__b: fakeServer,
        none: { command: '' },
      };

      expect(await manager.createTools(guard)).toEqual([]);
      expect(fakeVscode.window.messages).toHaveLength(3);
    });

    it('does not stop the other servers from working', async () => {
      configs = { srv: fakeServer, broken: { command: path.join(__dirname, 'no-such-program') } };

      expect(await manager.createTools(guard)).toHaveLength(13);
      expect(fakeVscode.window.messages).toHaveLength(1);
    });
  });

  describe('when the settings change', () => {
    it('stops a server that was removed or changed, and starts the new configuration', async () => {
      const first = await manager.createTools(guard);

      configs = { srv: { ...fakeServer, env: { CHANGED: '1' } } };

      const second = await manager.createTools(guard);

      expect(second).toHaveLength(13);
      expect(await first[0]?.execute({ text: 'x' })).toMatchObject({ reason: 'mcp_server_not_running' });
      expect(await second[0]?.execute({ text: 'x' })).toMatchObject({ status: 'success' });

      configs = {};
      manager.sync();

      expect(await second[0]?.execute({ text: 'x' })).toMatchObject({ reason: 'mcp_server_not_running' });
    });

    it('drops a server whose settings changed while it was starting', async () => {
      let reads = 0;

      manager = new McpManager(() => (++reads === 1 ? { srv: fakeServer } : {}));

      expect(await manager.createTools(guard)).toEqual([]);
    });

    it('stops a server that exited, so it is started again at the next message', async () => {
      const tools = await manager.createTools(guard);

      await tools.find((tool) => tool.id === 'mcp__srv__die')?.execute({});

      const again = await manager.createTools(guard);

      expect(again).toHaveLength(13);
      expect(await again[0]?.execute({ text: 'back' })).toMatchObject({ status: 'success', content: 'echo: back' });
    });
  });

  describe('a server nobody uses', () => {
    it('is stopped after a long time, and started again on demand', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });

      const tools = await manager.createTools(guard);

      vi.advanceTimersByTime(IDLE_STOP_MS + 2 * IDLE_CHECK_MS);

      expect(await tools[0]?.execute({ text: 'x' })).toMatchObject({ reason: 'mcp_server_not_running' });
      expect(await manager.createTools(guard)).toHaveLength(13);
    });

    it('stays while it is used', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });

      await manager.createTools(guard);
      vi.advanceTimersByTime(IDLE_STOP_MS - IDLE_CHECK_MS);

      const tools = await manager.createTools(guard);

      vi.advanceTimersByTime(IDLE_STOP_MS - IDLE_CHECK_MS);

      expect(await tools[0]?.execute({ text: 'still here' })).toMatchObject({ status: 'success' });
    });
  });

  it('stops every server when disposed', async () => {
    const tools = await manager.createTools(guard);

    manager.dispose();

    expect(await tools[0]?.execute({ text: 'x' })).toMatchObject({ reason: 'mcp_server_not_running' });
  });

  it('stops waiting for servers that are still starting when the request is cancelled', async () => {
    configs = { slow: { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] } };

    const controller = new AbortController();
    const running = manager.createTools(guard, controller.signal);

    setTimeout(() => controller.abort(), 100);

    expect(await running).toEqual([]);
  });
});
