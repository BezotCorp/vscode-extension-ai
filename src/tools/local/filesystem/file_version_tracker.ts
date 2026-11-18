import { MAX_SEGMENTS_PER_FILE, MAX_TRACKED_FILES } from './file_version_limits';
import type { ReceivedPart } from './received_part';
import type { SeenFile } from './seen_file';
// Internal memory of the file tools: what the model really received of each file, and how many times in a row an
// update was refused because that context had become wrong. It lives for one generation, like the context window
// it describes: earlier turns reach the model cut down or not at all, so nothing is assumed about them. The model
// never sees any of it.
export class FileVersionTracker {
  private readonly seenFiles = new Map<string, SeenFile>();
  private readonly conflictCounts = new Map<string, number>();

  // `received` is exactly what reached the model (see deliverFileContent), `sha` the SHA of the whole file at that
  // time and `complete` whether `received` is the entire file.
  remember(path: string, sha: string, received: string, complete: boolean): void {
    const previous = this.seenFiles.get(path);

    this.seenFiles.delete(path);

    if (complete) {
      this.seenFiles.set(path, {
        sha,
        complete: true,
        segments: [{ text: received, whole: true }],
      });
    } else {
      const kept = (previous?.segments ?? []).filter((segment) => segment.text !== received);

      this.seenFiles.set(path, {
        sha,
        complete: previous?.sha === sha && previous.complete,
        segments: [{ text: received, whole: false }, ...kept].slice(0, MAX_SEGMENTS_PER_FILE),
      });
    }

    if (this.seenFiles.size > MAX_TRACKED_FILES) {
      const oldest = this.seenFiles.keys().next().value;

      if (oldest !== undefined) {
        this.seenFiles.delete(oldest);
      }
    }
  }

  // The whole-file fast path: only valid when the model received the entire file and it is byte-for-byte the same.
  isCurrent(path: string, sha: string): boolean {
    const seen = this.seenFiles.get(path);

    return seen?.complete === true && seen.sha === sha;
  }

  // The file is the version the model last received, whether or not it received all of it.
  isSameVersion(path: string, sha: string): boolean {
    return this.seenFiles.get(path)?.sha === sha;
  }

  hasSeen(path: string): boolean {
    return this.seenFiles.has(path);
  }

  // The file changed, or the model only received part of it. A local change may go on only if the context it rests
  // on is still true: a part the model received (not the whole file, which the fast path covers) that is still, as
  // received, in the current file and holds the place of the change. The text being replaced only says where the
  // change goes; finding it in a part is not enough, the part itself must be unchanged around it.
  receivedPart(path: string, current: string, offset: number, length: number): ReceivedPart | undefined {
    for (const segment of this.seenFiles.get(path)?.segments ?? []) {
      if (segment.whole || segment.text === '') {
        continue;
      }

      for (let start = current.indexOf(segment.text); start >= 0; start = current.indexOf(segment.text, start + 1)) {
        if (offset >= start && offset + length <= start + segment.text.length) {
          return { text: segment.text, start };
        }
      }
    }

    return undefined;
  }

  // Returns the number of consecutive conflicts on that file, this one included.
  recordConflict(path: string): number {
    const count = (this.conflictCounts.get(path) ?? 0) + 1;

    this.conflictCounts.set(path, count);

    return count;
  }

  clearConflicts(path: string): void {
    this.conflictCounts.delete(path);
  }
}
