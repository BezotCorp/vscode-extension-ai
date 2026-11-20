import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { MAX_FILE_CHARS, TRUNCATION_MARKER } from '../../../../workspace';
import { toolSuccess } from '../../../tool_result';
import { CUT_MARKER } from '../../../tool_result_constants';
import { deliverFileContent } from '../deliver_file_content';

const build = (shown: { text: string }) => toolSuccess('read_file', '/a', { content: shown.text });

describe('deliverFileContent', () => {
  it('hands over a whole file that passes every limit, and says it received all of it', () => {
    const delivered = deliverFileContent('line 1\nline 2', build);

    expect(delivered.received).toBe('line 1\nline 2');
    expect(delivered.result.content).toBe('line 1\nline 2');
  });

  it('counts as received only what comes before the truncation marker, up to the last whole line', () => {
    const text = `${'x'.repeat(MAX_FILE_CHARS - 10)}\nlast line is cut here ${'y'.repeat(100)}`;
    const delivered = deliverFileContent(text, build);

    expect(delivered.result.content?.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(delivered.received).toBe('x'.repeat(MAX_FILE_CHARS - 10));
  });

  it('counts nothing as received when no whole line got through', () => {
    const delivered = deliverFileContent('z'.repeat(MAX_FILE_CHARS + 10), build);

    expect(delivered.received).toBe('');
  });

  it('counts as received only what the size of the whole result allows', () => {
    const lines = Array.from({ length: 200 }, (_, index) => `line number ${index}`);
    const delivered = deliverFileContent(lines.join('\n'), build, 1_000);

    expect(delivered.result.content?.endsWith(CUT_MARKER)).toBe(true);
    expect(delivered.received.length).toBeLessThan(1_000);
    expect(lines.join('\n').startsWith(delivered.received)).toBe(true);
    expect(delivered.received.endsWith('\n')).toBe(false);
    expect(delivered.received.split('\n').every((line) => lines.includes(line))).toBe(true);
    expect(JSON.stringify(delivered.result).length).toBeLessThanOrEqual(1_000);
  });

  it('handles an empty file correctly', () => {
    const delivered = deliverFileContent('', build);

    expect(delivered.received).toBe('');
    expect(delivered.result.content).toBe('');
  });

  it('handles a file with only one line correctly', () => {
    const delivered = deliverFileContent('single line', build);

    expect(delivered.received).toBe('single line');
    expect(delivered.result.content).toBe('single line');
  });

  it('handles a file with multiple lines correctly', () => {
    const delivered = deliverFileContent('line 1\nline 2\nline 3', build);

    expect(delivered.received).toBe('line 1\nline 2\nline 3');
    expect(delivered.result.content).toBe('line 1\nline 2\nline 3');
  });
});
