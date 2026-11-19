import { describe, expect, it } from 'vitest';

import type { ToolExecutionResult } from '../tool_execution_result';
import { fitToolResult, serializeToolResult, toolErrorFromException, toolFailure, toolSuccess } from '../tool_result';
import { CUT_MARKER, MAX_FIELD_CHARS_WHEN_CUT } from '../tool_result_constants';

describe('toolSuccess and toolFailure', () => {
  it('builds a success that was executed and is not worth retrying', () => {
    expect(toolSuccess('read_file', '/a', { content: 'x' })).toEqual({
      status: 'success',
      operation: 'read_file',
      resource: '/a',
      executed: true,
      retryable: false,
      content: 'x',
    });
  });

  it('builds a failure with the given status and fields', () => {
    expect(
      toolFailure('denied', 'update_file', '/a', {
        reason: 'user_refused',
        message: 'no',
        executed: false,
        retryable: false,
      }),
    ).toEqual({
      status: 'denied',
      operation: 'update_file',
      resource: '/a',
      reason: 'user_refused',
      message: 'no',
      executed: false,
      retryable: false,
    });
  });
});

describe('toolErrorFromException', () => {
  it('maps a known error code to its reason and keeps the detail', () => {
    const error = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const result = toolErrorFromException('read_file', '/a', error, false);

    expect(result.status).toBe('error');
    expect(result.reason).toBe('not_found');
    expect(result.message).toBe('The path does not exist. (no such file)');
    expect(result.details).toEqual({ code: 'ENOENT' });
    expect(result.executed).toBe(false);
  });

  it('reports an unknown outcome when the operation could have changed something', () => {
    expect(toolErrorFromException('update_file', '/a', new Error('boom'), true).executed).toBe('unknown');
  });

  it('turns an unknown error into an exception failure', () => {
    const result = toolErrorFromException('read_file', undefined, 'plain text', false);

    expect(result).toMatchObject({ reason: 'exception', message: 'plain text', retryable: false });
  });

  it('does not take an unlisted code for a known one', () => {
    const error = Object.assign(new Error('odd'), { code: 'EWHATEVER' });

    expect(toolErrorFromException('read_file', '/a', error, false).reason).toBe('exception');
  });
});

describe('fitToolResult', () => {
  const base: ToolExecutionResult = {
    status: 'success',
    operation: 'read_file',
    resource: '/a',
    executed: true,
    retryable: false,
  };

  it('returns a result that fits unchanged', () => {
    const result = { ...base, content: 'short' };
    const fitted = fitToolResult(result, 10_000);

    expect(fitted.result).toBe(result);
    expect(fitted.kept).toBe(5);
  });

  it('counts no kept content for a result without content', () => {
    expect(fitToolResult(base, 10_000).kept).toBe(0);
  });

  it('cuts only the content, so that the serialization fits exactly', () => {
    const fitted = fitToolResult({ ...base, content: 'x'.repeat(1_000) }, 400);

    expect(JSON.stringify(fitted.result)).toHaveLength(400);
    expect(fitted.result.content?.endsWith(CUT_MARKER)).toBe(true);
    expect(fitted.result.content?.startsWith('x'.repeat(fitted.kept))).toBe(true);
    expect(fitted.result.details).toEqual({ contentCutForContext: true });
    expect(fitted.kept).toBeGreaterThan(0);
    expect(fitted.kept).toBeLessThan(1_000);
  });

  it('keeps the details that were already there when it cuts the content', () => {
    const fitted = fitToolResult({ ...base, content: 'x'.repeat(1_000), details: { totalLines: 9 } }, 450);

    expect(fitted.result.details).toEqual({ totalLines: 9, contentCutForContext: true });
  });

  it('drops the details when the content cannot absorb the overflow', () => {
    const fitted = fitToolResult({ ...base, content: 'abc', details: { big: 'y'.repeat(5_000) } }, 500);

    expect(fitted.kept).toBe(0);
    expect(fitted.result.content).toBe(CUT_MARKER);
    expect(fitted.result.details).toEqual({ contentCutForContext: true, detailsDropped: true });
    expect(fitted.result.status).toBe('success');
  });

  it('shortens free-text fields as a last resort', () => {
    const fitted = fitToolResult({ ...base, message: 'm'.repeat(5_000) }, 300);

    expect(fitted.kept).toBe(0);
    expect(fitted.result.message).toBe(`${'m'.repeat(MAX_FIELD_CHARS_WHEN_CUT)}…`);
  });
});

describe('serializeToolResult', () => {
  it('serializes the result the model receives as compact JSON', () => {
    const result = toolSuccess('read_file', '/a', { content: 'x' });

    expect(serializeToolResult(result)).toBe(JSON.stringify(result));
  });

  it('serializes within the limit', () => {
    const serialized = serializeToolResult(toolSuccess('read_file', '/a', { content: 'x'.repeat(2_000) }), 600);

    expect(serialized.length).toBeLessThanOrEqual(600);
    expect(JSON.parse(serialized).details.contentCutForContext).toBe(true);
  });
});
