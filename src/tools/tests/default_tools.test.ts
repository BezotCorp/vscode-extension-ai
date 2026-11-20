import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => (await import('./support/fake_vscode')).fakeVscode);
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  isMessageKey: (key: string) => key === 'toolSummary.read_file',
}));

import type { McpManager } from '../../mcp';
import type { ToolPermissionInfo } from '../../permissions';
import { createBuiltInTools, createDefaultToolRegistry } from '../default_tools';
import { listToolPermissions } from '../list_tool_permissions';
import { FileToolServices } from '../local';
import type { ToolAccessGuard } from '../tool_access_guard';
import { openFolder } from './support/fake_vscode';

const EXPECTED_TOOLS = [
  'read_file',
  'read_files',
  'list_files',
  'search_text',
  'create_file',
  'create_files',
  'update_file',
  'update_files',
  'delete_file',
  'delete_files',
  'move_file',
  'move_files',
  'web_fetch',
  'git_status',
  'git_diff',
  'git_log',
  'git_show',
  'git_branch_list',
  'git_add',
  'git_unstage',
  'git_commit',
  'git_branch_create',
  'git_switch',
  'git_fetch',
  'git_pull',
  'git_push',
];

let base: string;
let files: FileToolServices;
const guard = (reasons: Record<string, string> = {}) =>
  ({
    assertReadable: async () => undefined,
    assertPath: async () => undefined,
    unavailableReason: (tool: { id: string }) => reasons[tool.id],
  }) as unknown as ToolAccessGuard;

describe('the tools the extension provides', () => {
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bezotcorp-default-tools-')));
    openFolder(base);
    files = new FileToolServices(path.join(base, 'storage'));
  });

  afterEach(async () => {
    files.dispose();
    await fs.rm(base, { recursive: true, force: true });
  });

  describe('createBuiltInTools', () => {
    it('provides exactly the documented tools, and none that runs an arbitrary program', () => {
      const ids = createBuiltInTools(guard(), files).map((tool) => tool.id);

      expect(ids).toEqual(EXPECTED_TOOLS);
      expect(ids.some((id) => /shell|run|exec|command/.test(id))).toBe(false);
    });

    it('gives each tool a unique id, a description and a schema', () => {
      const tools = createBuiltInTools(guard(), files);

      expect(new Set(tools.map((tool) => tool.id)).size).toBe(tools.length);

      for (const tool of tools) {
        expect(tool.description.length, tool.id).toBeGreaterThan(10);
        expect(tool.parameters.type).toBe('object');
      }
    });

    it('lets only tools that cannot change anything stay available in read-only mode', () => {
      const readOnly = createBuiltInTools(guard(), files)
        .filter((tool) => tool.readOnlyCompatible)
        .map((tool) => tool.id);

      expect(readOnly).toEqual([
        'read_file',
        'read_files',
        'list_files',
        'search_text',
        'git_status',
        'git_diff',
        'git_log',
        'git_show',
        'git_branch_list',
      ]);
    });

    it('asks by default for every tool that changes something', () => {
      for (const tool of createBuiltInTools(guard(), files).filter((candidate) => !candidate.readOnlyCompatible)) {
        expect(tool.permissionDefault, tool.id).toBe('ask');
      }
    });

    it('makes every plural file tool share the permission of its singular tool', () => {
      const tools = new Map(createBuiltInTools(guard(), files).map((tool) => [tool.id, tool]));

      for (const name of ['read', 'create', 'update', 'delete', 'move']) {
        expect(tools.get(`${name}_files`)?.permissionKey).toBe(`${name}_file`);
      }
    });

    it('needs a trusted workspace for every git tool', () => {
      for (const tool of createBuiltInTools(guard(), files).filter((candidate) => candidate.id.startsWith('git_'))) {
        expect(tool.requiresTrust, tool.id).toBe(true);
      }
    });
  });

  describe('createDefaultToolRegistry', () => {
    it('registers every tool that is available', () => {
      expect(
        createDefaultToolRegistry(guard(), files)
          .list()
          .map((tool) => tool.id),
      ).toEqual(EXPECTED_TOOLS);
    });

    it('leaves out a tool that cannot be used now and records why, so the model can say so', () => {
      const registry = createDefaultToolRegistry(
        guard({ update_file: 'the autonomy mode is read-only', update_files: 'the autonomy mode is read-only' }),
        files,
      );

      expect(registry.get('update_file')).toBeUndefined();
      expect(registry.get('read_file')).toBeDefined();
      // The plural tool shares the permission of the singular one: it is reported once.
      expect(registry.unavailableTools()).toEqual([
        { id: 'update_file', name: 'Update File', reason: 'the autonomy mode is read-only' },
      ]);
    });

    it('wires the observations of the file tools to the registry, so the tool loop can take them', async () => {
      await fs.writeFile(path.join(base, 'a.txt'), 'hello\n');

      const registry = createDefaultToolRegistry(guard(), files);

      expect(registry.takeObservations()).toEqual([]);

      await registry.execute('read_file', { path: 'a.txt' });

      expect(registry.takeObservations()).toMatchObject([
        { path: path.join(base, 'a.txt'), complete: true, origin: 'read' },
      ]);
      expect(registry.takeObservations()).toEqual([]);
    });

    it('gives each registry its own record of what the model has seen, since each belongs to one generation', async () => {
      await fs.writeFile(path.join(base, 'a.txt'), 'hello\n');

      const first = createDefaultToolRegistry(guard(), files);
      const second = createDefaultToolRegistry(guard(), files);

      await first.execute('read_file', { path: 'a.txt' });

      expect(second.takeObservations()).toEqual([]);

      // The second generation has not read the file: an edit is refused, as it rests on nothing it received.
      const refused = await second.execute('update_file', { path: 'a.txt', old_text: 'hello', new_text: 'bye' });

      expect(refused).toMatchObject({ reason: 'file_changed' });
      expect(await fs.readFile(path.join(base, 'a.txt'), 'utf8')).toBe('hello\n');
    });
  });

  describe('listToolPermissions', () => {
    const mcp = (tools: object[]) => ({ describeTools: async () => tools }) as unknown as McpManager;

    it('lists each tool once under the identity its permission is kept under, grouped, files then git then network', async () => {
      const listed = await listToolPermissions(guard(), mcp([]), files);

      expect(listed.map((tool) => tool.id)).toEqual([
        'read_file',
        'list_files',
        'search_text',
        'create_file',
        'update_file',
        'delete_file',
        'move_file',
        'git_status',
        'git_diff',
        'git_log',
        'git_show',
        'git_branch_list',
        'git_add',
        'git_unstage',
        'git_commit',
        'git_branch_create',
        'git_switch',
        'git_fetch',
        'git_pull',
        'git_push',
        'web_fetch',
      ]);
      expect(listed.find((tool) => tool.id === 'read_file')?.group).toBe('group.files');
      expect(listed.find((tool) => tool.id === 'git_add')?.group).toBe('group.git');
      expect(listed.find((tool) => tool.id === 'web_fetch')?.group).toBe('group.network');
    });

    it('shows the summary written for the user when there is one, and the description of the tool otherwise', async () => {
      const listed = await listToolPermissions(guard(), mcp([]), files);

      expect(listed.find((tool) => tool.id === 'read_file')?.description).toBe('toolSummary.read_file');
      expect(listed.find((tool) => tool.id === 'list_files')?.description).toContain('Lists the useful file structure');
    });

    it('carries the default policy of each tool', async () => {
      const listed = await listToolPermissions(guard(), mcp([]), files);

      expect(listed.find((tool) => tool.id === 'read_file')?.defaultPolicy).toBe('allow');
      expect(listed.find((tool) => tool.id === 'update_file')?.defaultPolicy).toBe('ask');
    });

    it('adds the tools of the MCP servers last, each asking by default and grouped by server', async () => {
      const listed: ToolPermissionInfo[] = await listToolPermissions(
        guard(),
        mcp([{ permissionKey: 'mcp__srv__echo', server: 'srv', name: 'echo', description: 'Echoes' }]),
        files,
      );

      expect(listed.at(-1)).toEqual({
        id: 'mcp__srv__echo',
        name: 'echo',
        description: 'Echoes',
        group: 'group.mcp:{"server":"srv"}',
        defaultPolicy: 'ask',
      });
    });
  });
});
