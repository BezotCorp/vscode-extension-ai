import { createHash } from 'node:crypto';
import { PatchCandidate } from '.';

const PATCH_BLOCK_REGEX = /```patch\s*([\s\S]*?)```/g;

export function parsePatchCandidates(text: string): PatchCandidate[] {
  const candidates: PatchCandidate[] = [];

  for (const match of text.matchAll(PATCH_BLOCK_REGEX)) {
    const candidate = parsePatchBlock(match[1], candidates.length);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function parsePatchBlock(block: string, index: number): PatchCandidate | undefined {
  const fileMatch = block.match(/FILE:[ \t]*(.+)/);
  const oldMatch = block.match(/OLD:([\s\S]*?)\r?\nNEW:/);
  const newMatch = block.match(/\r?\nNEW:([\s\S]*)/);

  const path = fileMatch?.[1]?.trim();
  // Only the line breaks that belong to the markers are removed: indentation and blank lines are part of the text.
  const oldText = oldMatch ? stripMarkerBreaks(oldMatch[1]) : undefined;
  const newText = newMatch ? stripMarkerBreaks(newMatch[1]) : undefined;

  if (!path || !oldText?.trim() || newText === undefined) {
    return undefined;
  }

  return {
    // Derived from the content, so the same response yields the same ids after a reload and a decision can be kept.
    id: createHash('sha256')
      .update([path, oldText, newText, String(index)].join('\0'))
      .digest('hex')
      .slice(0, 16),
    path,
    oldText,
    newText,
    createdAt: new Date().toISOString(),
  };
}

// "OLD:\n<text>\nNEW:" and "NEW:\n<text>\n```": drop the break after the marker and the one before the next marker.
function stripMarkerBreaks(text: string): string {
  const afterBreak = text.replace(/^[ \t]*\r?\n/, '');
  // "OLD: text" on the marker line: only the single space after the colon is not part of the text.
  const start = afterBreak === text ? text.replace(/^ /, '') : afterBreak;

  return start.replace(/\r?\n[ \t]*$/, '');
}
