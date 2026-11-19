import { describe, expect, it } from 'vitest';

import { truncateContent, truncateText } from '../truncate_content';
import { TRUNCATION_MARKER } from '../truncate_content_constants';
import { MAX_FILE_CHARS } from '../workspace_limits';

describe('truncateText', () => {
  it('returns content within the limit unchanged', () => {
    expect(truncateText('abc', 3)).toEqual({ text: 'abc', truncated: false, originalLength: 3 });
  });

  it('cuts content over the limit, marks it and tells the original length', () => {
    expect(truncateText('abcdef', 3)).toEqual({
      text: `abc${TRUNCATION_MARKER}`,
      truncated: true,
      originalLength: 6,
    });
  });

  it('uses the file limit by default', () => {
    expect(truncateText('x'.repeat(MAX_FILE_CHARS)).truncated).toBe(false);
    expect(truncateText('x'.repeat(MAX_FILE_CHARS + 1)).truncated).toBe(true);
  });
});

describe('truncateContent', () => {
  it('returns only the text', () => {
    expect(truncateContent('short')).toBe('short');
    expect(truncateContent('x'.repeat(MAX_FILE_CHARS + 5))).toBe(`${'x'.repeat(MAX_FILE_CHARS)}${TRUNCATION_MARKER}`);
  });
});
