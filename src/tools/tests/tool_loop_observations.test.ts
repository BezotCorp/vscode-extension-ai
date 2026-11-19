import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { FileVersionTracker } from '../local/filesystem/file_version_tracker';
import { MAX_CALLS_PER_ROUND } from '../tool_loop_limits';
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

  it('runs only the calls allowed in a round and refuses the others', async () => {
    const calls = Array.from({ length: MAX_CALLS_PER_ROUND + 1 }, (_, index) => ({
      name: 'read_file',
      arguments: { path: `/w/${index}.ts` },
    }));
    const [round] = await run(registryWithReader(new FileVersionTracker()), calls);

    expect(round?.calls).toHaveLength(MAX_CALLS_PER_ROUND + 1);
    expect(JSON.parse(round?.calls[MAX_CALLS_PER_ROUND]?.result ?? '{}')).toMatchObject({
      reason: 'too_many_calls',
      executed: false,
    });
    expect(round?.calls[MAX_CALLS_PER_ROUND]).not.toHaveProperty('observations');
  });

  it('does not repeat a call that ended with an uncertain outcome', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(async () => ({
      status: 'unknown' as const,
      operation: 'write',
      executed: 'unknown' as const,
      retryable: false,
    }));

    registry.register({
      id: 'write',
      name: 'Write',
      description: '',
      parameters: { type: 'object', properties: {} },
      readOnlyCompatible: false,
      permissionDefault: 'ask',
      execute,
    });

    const [round] = await run(registry, [
      { name: 'write', arguments: {} },
      { name: 'write', arguments: {} },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(round?.calls[1]?.result ?? '{}')).toMatchObject({ reason: 'repeat_blocked' });
  });

  it('stops with an error when the request is aborted, after reporting the calls that have a result', async () => {
    const controller = new AbortController();
    const registry = registryWithReader(new FileVersionTracker());
    const rounds: ToolRound[] = [];

    await expect(
      runToolLoop<string>({
        messages: [],
        tools: registry,
        maxRounds: 3,
        signal: controller.signal,
        runRound: async () => ({
          content: '',
          toolCalls: [
            { name: 'read_file', arguments: { path: '/w/a.ts' } },
            { name: 'read_file', arguments: { path: '/w/b.ts' } },
          ],
        }),
        assistantMessage: (content) => content,
        toolMessage: (_call, content) => content,
        onToolResult: () => controller.abort(),
        onRound: (round) => rounds.push(round),
      }),
    ).rejects.toThrow('Generation aborted');

    expect(rounds[0]?.calls).toHaveLength(1);
  });

  it('answers without tools once the round limit is reached', async () => {
    const seen: boolean[] = [];

    await runToolLoop<string>({
      messages: [],
      tools: registryWithReader(new FileVersionTracker()),
      maxRounds: 1,
      runRound: async (_messages, allowTools) => {
        seen.push(allowTools);

        return { content: '', toolCalls: [{ name: 'read_file', arguments: { path: '/w/a.ts' } }] };
      },
      assistantMessage: (content) => content,
      toolMessage: (_call, content) => content,
    });

    expect(seen).toEqual([true, false]);
  });
});
