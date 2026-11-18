import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { FileVersionTracker } from '../local/filesystem/file_version_tracker';
import { runToolLoop } from '../tool_loop_options';
import { ToolRegistry } from '../tool_registry';
import type { ToolRound } from '../tool_round';

const SHA = 'c'.repeat(64);

function registryWithReader(versions: FileVersionTracker): ToolRegistry {
  const registry = new ToolRegistry();

  registry.setObservationSource(() => versions.takeObservations());
  registry.register({
    id: 'read_file',
    name: 'Read File',
    description: '',
    parameters: { type: 'object', properties: { path: { type: 'string', description: '' } }, required: ['path'] },
    readOnlyCompatible: true,
    permissionDefault: 'allow',
    async execute(input) {
      const path = (input as { path: string }).path;

      versions.remember(path, SHA, `content of ${path}`, false, 'read');

      return { status: 'success', operation: 'read_file', resource: path, executed: true, retryable: false };
    },
  });

  return registry;
}

async function run(tools: ToolRegistry, calls: { name: string; arguments: unknown }[]): Promise<ToolRound[]> {
  const rounds: ToolRound[] = [];
  let step = 0;

  await runToolLoop<string>({
    messages: [],
    tools,
    maxRounds: 3,
    runRound: async () => (step++ === 0 ? { content: '', toolCalls: calls } : { content: 'done', toolCalls: [] }),
    assistantMessage: (content) => content,
    toolMessage: (_call, content) => content,
    onRound: (round) => rounds.push(round),
  });

  return rounds;
}

describe('tool loop observations', () => {
  it('attaches to each call only the observations that call made', async () => {
    const versions = new FileVersionTracker();
    const [round] = await run(registryWithReader(versions), [
      { name: 'read_file', arguments: { path: '/w/a.ts' } },
      { name: 'read_file', arguments: { path: '/w/b.ts' } },
    ]);

    expect(round?.calls[0]?.observations).toEqual([
      { path: '/w/a.ts', sha: SHA, complete: false, origin: 'read', text: 'content of /w/a.ts' },
    ]);
    expect(round?.calls[1]?.observations?.map((observation) => observation.path)).toEqual(['/w/b.ts']);
  });

  it('keeps the observations out of the result the model receives', async () => {
    const [round] = await run(registryWithReader(new FileVersionTracker()), [
      { name: 'read_file', arguments: { path: '/w/a.ts' } },
    ]);

    expect(round?.calls[0]?.result).not.toContain(SHA);
    expect(round?.calls[0]?.result).not.toContain('content of');
  });

  it('adds no observation to a call that observed nothing', async () => {
    const [round] = await run(registryWithReader(new FileVersionTracker()), [{ name: 'unknown_tool', arguments: {} }]);

    expect(round?.calls[0]).not.toHaveProperty('observations');
  });
});
