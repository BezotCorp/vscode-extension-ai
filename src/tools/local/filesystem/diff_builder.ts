import { DiffLine } from './diff_line';

export function buildDiffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  if (oldText === newText) {
    return oldLines.map((content) => ({
      kind: 'unchanged',
      content,
    }));
  }

  const commonPrefixLength = getCommonPrefixLength(oldLines, newLines);
  const commonSuffixLength = getCommonSuffixLength(oldLines, newLines, commonPrefixLength);

  const prefix = oldLines.slice(0, commonPrefixLength).map((content) => ({
    kind: 'unchanged' as const,
    content,
  }));

  const removed = oldLines.slice(commonPrefixLength, oldLines.length - commonSuffixLength).map((content) => ({
    kind: 'removed' as const,
    content,
  }));

  const added = newLines.slice(commonPrefixLength, newLines.length - commonSuffixLength).map((content) => ({
    kind: 'added' as const,
    content,
  }));

  const suffix = oldLines.slice(oldLines.length - commonSuffixLength).map((content) => ({
    kind: 'unchanged' as const,
    content,
  }));

  return [...prefix, ...removed, ...added, ...suffix];
}

function getCommonPrefixLength(oldLines: string[], newLines: string[]): number {
  const maxLength = Math.min(oldLines.length, newLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (oldLines[index] !== newLines[index]) {
      return index;
    }
  }

  return maxLength;
}

function getCommonSuffixLength(oldLines: string[], newLines: string[], prefixLength: number): number {
  const maxLength = Math.min(oldLines.length, newLines.length) - prefixLength;

  for (let index = 0; index < maxLength; index += 1) {
    const oldLine = oldLines[oldLines.length - 1 - index];
    const newLine = newLines[newLines.length - 1 - index];

    if (oldLine !== newLine) {
      return index;
    }
  }

  return maxLength;
}
