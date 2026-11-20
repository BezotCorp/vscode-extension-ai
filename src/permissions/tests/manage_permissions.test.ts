import { beforeEach, describe, expect, it, vi } from 'vitest';

type Item = { label: string; kind?: number; toolId?: string; grant?: unknown; policy?: string; lifetime?: string };
type Answer = (items: Item[], options: { title?: string }) => Item | undefined;

const ui = vi.hoisted(() => ({
  answers: [] as unknown[],
  shown: [] as { items: unknown[]; options: unknown }[],
  executeCommand: undefined as unknown,
}));

vi.mock('vscode', () => ({
  QuickPickItemKind: { Separator: -1 },
  window: {
    showQuickPick: async (items: unknown[], options: unknown) => {
      ui.shown.push({ items, options });

      const answer = ui.answers.shift() as Answer | undefined;

      return answer?.(items as Item[], options as { title?: string });
    },
  },
  commands: {
    executeCommand: (...args: unknown[]) => (ui.executeCommand as (...args: unknown[]) => unknown)(...args),
  },
}));
vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, string>) => (params ? `${key}(${Object.values(params).join(',')})` : key),
}));

import { managePermissions } from '../manage_permissions';
import type { PermissionStore } from '../permission_store';
import type { ToolPermissionInfo } from '../tool_permission_info';

const tools: ToolPermissionInfo[] = [
  { id: 'read_file', name: 'Read File', description: 'reads', group: 'Files', defaultPolicy: 'allow' },
  { id: 'update_file', name: 'Update File', description: 'updates', group: 'Files', defaultPolicy: 'ask' },
  { id: 'git_status', name: 'Git Status', description: 'status', group: 'Git', defaultPolicy: 'allow' },
];

const grant = { toolId: 'read_file', path: '/work/a', kind: 'exact' as const, lifetime: 'currentSession' as const };

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    resolve: vi.fn(() => undefined),
    get: vi.fn(() => undefined),
    set: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    clearToolDecisions: vi.fn(async () => undefined),
    clearResourcePermissions: vi.fn(async () => undefined),
    removeResourcePermission: vi.fn(async () => undefined),
    listResourcePermissions: vi.fn(() => []),
    ...overrides,
  };
}

const cancel: Answer = () => undefined;
const byLabel =
  (label: string): Answer =>
  (items) =>
    items.find((item) => item.label === label);
const byTool =
  (toolId: string): Answer =>
  (items) =>
    items.find((item) => item.toolId === toolId);
const byPolicy =
  (policy: string | undefined): Answer =>
  (items) =>
    items.find((item) => item.policy === policy);
const byLifetime =
  (lifetime: string): Answer =>
  (items) =>
    items.find((item) => item.lifetime === lifetime);

async function run(store: ReturnType<typeof makeStore>, ...answers: Answer[]): Promise<void> {
  ui.answers = answers;
  await managePermissions(store as unknown as PermissionStore, async () => tools);
}

describe('managePermissions', () => {
  beforeEach(() => {
    ui.answers = [];
    ui.shown = [];
    ui.executeCommand = vi.fn();
  });

  it('closes without changing anything when the menu is dismissed', async () => {
    const store = makeStore();

    await run(store, cancel);

    expect(ui.shown).toHaveLength(1);
    expect(store.set).not.toHaveBeenCalled();
  });

  it('lists the tools by group, then the resource grants, then the maintenance actions', async () => {
    const store = makeStore({ listResourcePermissions: vi.fn(() => [grant]) });

    await run(store, cancel);

    const items = ui.shown[0]?.items as Item[];

    expect(items.map((item) => item.label)).toEqual([
      'Files',
      'Read File',
      'Update File',
      'Git',
      'Git Status',
      'manage.groupResources',
      '/work/a',
      'manage.groupMaintenance',
      'manage.resetToolsCurrent',
      'manage.resetToolsAll',
      'manage.clearResourcesCurrent',
      'manage.clearResourcesAll',
      'manage.editProtected',
    ]);
    expect(items.filter((item) => item.kind === -1)).toHaveLength(4);
  });

  it('describes a tool by its default policy, or by the decision that applies to it', async () => {
    const store = makeStore({
      resolve: vi.fn((id: string) => (id === 'update_file' ? { policy: 'deny', lifetime: 'allSessions' } : undefined)),
    });

    await run(store, cancel);

    const items = ui.shown[0]?.items as (Item & { description?: string })[];

    expect(items.find((item) => item.toolId === 'read_file')?.description).toBe(
      'policy.allow.short · policy.default.short',
    );
    expect(items.find((item) => item.toolId === 'update_file')?.description).toBe(
      'policy.deny.short · lifetime.allsessions',
    );
  });

  it('sets a policy for the lifetime the user picks, then shows the menu again', async () => {
    const store = makeStore();

    await run(store, byTool('update_file'), byPolicy('deny'), byLifetime('allSessions'), cancel);

    expect(store.set).toHaveBeenCalledWith('update_file', 'deny', 'allSessions');
    expect(ui.shown).toHaveLength(4);
  });

  it('changes nothing when the policy or the lifetime is not chosen', async () => {
    const store = makeStore();

    await run(store, byTool('update_file'), cancel, cancel);
    await run(store, byTool('update_file'), byPolicy('allow'), cancel, cancel);

    expect(store.set).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('removes a decision with "use the default", offering only the lifetimes that hold one', async () => {
    const store = makeStore({
      get: vi.fn((_id: string, lifetime: string) => (lifetime === 'allSessions' ? 'allow' : undefined)),
    });

    await run(
      store,
      byTool('read_file'),
      byPolicy(undefined),
      (items) => {
        expect(items.map((item) => item.lifetime)).toEqual(['allSessions']);

        return items[0];
      },
      cancel,
    );

    expect(store.clear).toHaveBeenCalledWith('read_file', 'allSessions');
  });

  it('does not ask for a lifetime when "use the default" has nothing to remove', async () => {
    const store = makeStore();

    await run(store, byTool('read_file'), byPolicy(undefined), cancel);

    expect(store.clear).not.toHaveBeenCalled();
    expect(ui.shown).toHaveLength(3);
  });

  it('revokes a resource grant after confirmation, and keeps it when that is dismissed', async () => {
    const store = makeStore({ listResourcePermissions: vi.fn(() => [grant]) });

    await run(store, (items) => items.find((item) => item.grant), cancel, cancel);
    expect(store.removeResourcePermission).not.toHaveBeenCalled();

    await run(
      store,
      (items) => items.find((item) => item.grant),
      (items) => items[0],
      cancel,
    );
    expect(store.removeResourcePermission).toHaveBeenCalledWith(grant);
  });

  it('clears the resource grants of the session or of all sessions', async () => {
    const store = makeStore();

    await run(store, byLabel('manage.clearResourcesCurrent'), byLabel('manage.clearResourcesAll'), cancel);

    expect(store.clearResourcePermissions).toHaveBeenNthCalledWith(1, 'currentSession');
    expect(store.clearResourcePermissions).toHaveBeenNthCalledWith(2, 'allSessions');
  });

  it('resets the tool decisions of the session or of all sessions', async () => {
    const store = makeStore();

    await run(store, byLabel('manage.resetToolsCurrent'), byLabel('manage.resetToolsAll'), cancel);

    expect(store.clearToolDecisions).toHaveBeenNthCalledWith(1, 'currentSession');
    expect(store.clearToolDecisions).toHaveBeenNthCalledWith(2, 'allSessions');
  });

  it('opens the settings for the protected paths and closes the menu', async () => {
    const store = makeStore();

    await run(store, byLabel('manage.editProtected'));

    expect(ui.executeCommand).toHaveBeenCalledWith('workbench.action.openSettings', 'bezotcorpAi.protectedPaths');
    expect(ui.shown).toHaveLength(1);
  });

  it('ignores a choice that matches nothing and shows the menu again', async () => {
    const store = makeStore();

    await run(store, () => ({ label: 'unknown' }), cancel);

    expect(ui.shown).toHaveLength(2);
  });
});
