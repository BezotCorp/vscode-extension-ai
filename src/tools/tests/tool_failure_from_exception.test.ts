import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));
vi.mock('../../i18n', () => ({ t: (key: string) => key }));

import { PermissionError } from '../../permissions';
import type { Tool } from '../tool';
import { toolFailureFromException } from '../tool_failure_from_exception';

function makeTool(readOnlyCompatible: boolean): Tool {
  return {
    id: 'a_tool',
    name: 'A tool',
    description: '',
    parameters: { type: 'object', properties: {} },
    readOnlyCompatible,
    permissionDefault: 'ask',
    execute: async () => {
      throw new Error('unused');
    },
  };
}

describe('toolFailureFromException', () => {
  it('turns a missing decision into a retryable cancellation', () => {
    const error = new PermissionError('no_decision', 'dialog_closed', 'closed', '/a');
    const result = toolFailureFromException(makeTool(false), error);

    expect(result).toMatchObject({
      status: 'cancelled',
      reason: 'dialog_closed',
      resource: '/a',
      executed: false,
      retryable: true,
    });
  });

  it('turns a refusal by the user into a denial decided by the user', () => {
    const error = new PermissionError('user_refused', 'user_refused', 'no', '/a');
    const result = toolFailureFromException(makeTool(false), error);

    expect(result.status).toBe('denied');
    expect(result.retryable).toBe(false);
    expect(result.details).toMatchObject({ decidedBy: 'user' });
  });

  it('turns a policy refusal into a denial decided by policy', () => {
    const error = new PermissionError('policy', 'read_only_mode', 'read only');
    const result = toolFailureFromException(makeTool(false), error);

    expect(result.details).toMatchObject({ decidedBy: 'policy' });
    expect(result.retryable).toBe(false);
  });

  it('lets the model retry only when it can fix the refusal itself', () => {
    const error = new PermissionError('policy', 'critical_justification_required', 'justify', '/a', {
      correctableByTheModel: true,
      requiredAccess: 'critical',
    });
    const result = toolFailureFromException(makeTool(false), error);

    expect(result.retryable).toBe(true);
    expect(result.details).toMatchObject({ decidedBy: 'policy', requiredAccess: 'critical' });
  });

  it('turns an aborted signal into a cancellation, outcome unknown for a tool that can write', () => {
    const controller = new AbortController();

    controller.abort();

    const result = toolFailureFromException(makeTool(false), new Error('x'), { signal: controller.signal });

    expect(result).toMatchObject({ status: 'cancelled', reason: 'cancelled_by_user', executed: 'unknown' });
  });

  it('knows that a read-only tool executed nothing when it was cancelled', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });

    expect(toolFailureFromException(makeTool(true), abort)).toMatchObject({ status: 'cancelled', executed: false });
  });

  it('turns any other exception into a technical failure', () => {
    const result = toolFailureFromException(makeTool(false), new Error('boom'));

    expect(result).toMatchObject({ status: 'error', reason: 'exception', message: 'boom', executed: 'unknown' });
    expect(toolFailureFromException(makeTool(true), new Error('boom')).executed).toBe(false);
  });
});
