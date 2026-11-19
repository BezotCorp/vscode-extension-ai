import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));
vi.mock('../../i18n', () => ({ t: (key: string) => key }));

import { PermissionError } from '../../permissions';
import type { Tool } from '../tool';
import type { ToolExecutionContext } from '../tool_execution_context';
import { ToolRegistry } from '../tool_registry';
import { toolSuccess } from '../tool_result';

function makeTool(id: string, execute?: Tool['execute']): Tool {
  return {
    id,
    name: id,
    description: `${id} description`,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    readOnlyCompatible: true,
    permissionDefault: 'allow',
    execute: execute ?? (async (input) => toolSuccess(id, (input as { path: string }).path)),
  };
}

describe('ToolRegistry', () => {
  it('registers, finds and lists tools, and describes them to the model', () => {
    const registry = new ToolRegistry();

    registry.register(makeTool('a'));
    registry.register(makeTool('b'));

    expect(registry.get('a')?.id).toBe('a');
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.list().map((tool) => tool.id)).toEqual(['a', 'b']);
    expect(registry.definitions()[0]).toEqual({
      name: 'a',
      description: 'a description',
      parameters: makeTool('a').parameters,
    });
  });

  it('reports an unavailable tool once, under its permission key', () => {
    const registry = new ToolRegistry();

    registry.markUnavailable({ ...makeTool('update_files'), permissionKey: 'update_file' }, 'read-only');
    registry.markUnavailable(makeTool('update_file'), 'read-only');

    expect(registry.unavailableTools()).toEqual([{ id: 'update_file', name: 'update_files', reason: 'read-only' }]);
  });

  it('hands out a copy of the unavailable tools', () => {
    const registry = new ToolRegistry();

    registry.markUnavailable(makeTool('a'), 'why');
    registry.unavailableTools().pop();

    expect(registry.unavailableTools()).toHaveLength(1);
  });

  describe('execute', () => {
    it('refuses an unknown tool and lists the available ones', async () => {
      const registry = new ToolRegistry();

      registry.register(makeTool('a'));

      const result = await registry.execute('nope', {});

      expect(result).toMatchObject({ status: 'error', reason: 'unknown_tool', executed: false, retryable: true });
      expect(result.message).toContain('Available tools: a.');
    });

    it('refuses arguments that are not valid JSON', async () => {
      const registry = new ToolRegistry();

      registry.register(makeTool('a'));

      expect(await registry.execute('a', '{not json')).toMatchObject({ reason: 'invalid_arguments' });
    });

    it('accepts arguments given as a JSON string', async () => {
      const registry = new ToolRegistry();

      registry.register(makeTool('a'));

      expect(await registry.execute('a', '{"path":"/x"}')).toMatchObject({ status: 'success', resource: '/x' });
    });

    it('refuses arguments that do not satisfy the schema, naming the problem', async () => {
      const registry = new ToolRegistry();

      registry.register(makeTool('a'));

      const result = await registry.execute('a', {});

      expect(result).toMatchObject({ reason: 'invalid_arguments', executed: false });
      expect(result.message).toBe('Invalid arguments: missing required argument "path".');
    });

    it('does not start a tool when the request was already cancelled', async () => {
      const registry = new ToolRegistry();
      const execute = vi.fn();
      const controller = new AbortController();

      registry.register(makeTool('a', execute));
      controller.abort();

      const result = await registry.execute('a', { path: 'x' }, { signal: controller.signal });

      expect(result).toMatchObject({ status: 'cancelled', reason: 'cancelled_by_user', executed: false });
      expect(execute).not.toHaveBeenCalled();
    });

    it('hands the parsed input and the context to the tool', async () => {
      const registry = new ToolRegistry();
      const execute = vi.fn(async () => toolSuccess('a', undefined));
      const context: ToolExecutionContext = { maxResultChars: 99 };

      registry.register(makeTool('a', execute));
      await registry.execute('a', { path: 'x' }, context);

      expect(execute).toHaveBeenCalledWith({ path: 'x' }, context);
    });

    it('never lets an exception out: a refusal becomes a denied result', async () => {
      const registry = new ToolRegistry();

      registry.register(
        makeTool('a', async () => {
          throw new PermissionError('user_refused', 'user_refused', 'no');
        }),
      );

      expect(await registry.execute('a', { path: 'x' })).toMatchObject({ status: 'denied' });
    });

    it('turns any other exception into a technical failure', async () => {
      const registry = new ToolRegistry();

      registry.register(
        makeTool('a', async () => {
          throw new Error('boom');
        }),
      );

      expect(await registry.execute('a', { path: 'x' })).toMatchObject({ status: 'error', message: 'boom' });
    });
  });

  describe('observations', () => {
    it('has none without a source', () => {
      expect(new ToolRegistry().takeObservations()).toEqual([]);
    });

    it('takes them from the source it was given', () => {
      const registry = new ToolRegistry();
      const observation = { path: '/a', sha: 'a'.repeat(64), complete: true, origin: 'read' as const };

      registry.setObservationSource(() => [observation]);

      expect(registry.takeObservations()).toEqual([observation]);
    });
  });
});
