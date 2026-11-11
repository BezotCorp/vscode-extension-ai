export type UniqueMatch =
  | { kind: 'missing' }
  | { kind: 'ambiguous'; count: number }
  | { kind: 'unique'; offset: number; oldText: string; newText: string };

// The text to change in update_file: must be found exactly once, never at a guessed position.
// Models write line breaks as \n; a file saved with \r\n would never match, so retry once with the file's own breaks.
export function findUniqueMatch(content: string, oldText: string, newText: string): UniqueMatch {
  const exact = locate(content, oldText, newText);

  if (exact.kind !== 'missing' || !content.includes('\r\n') || oldText.includes('\r\n')) {
    return exact;
  }

  return locate(content, toCrlf(oldText), toCrlf(newText));
}

function locate(content: string, oldText: string, newText: string): UniqueMatch {
  const offset = content.indexOf(oldText);

  if (offset < 0) {
    return { kind: 'missing' };
  }

  // Overlapping occurrences count too: a repeated pattern must not be edited at a guessed position.
  let count = 1;

  for (let next = content.indexOf(oldText, offset + 1); next >= 0; next = content.indexOf(oldText, next + 1)) {
    count++;
  }

  return count > 1 ? { kind: 'ambiguous', count } : { kind: 'unique', offset, oldText, newText };
}

function toCrlf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}
