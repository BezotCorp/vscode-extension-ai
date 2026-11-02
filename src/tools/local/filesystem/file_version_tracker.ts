// Internal memory shared by the file tools: the version (SHA) of each file as the AI last received it, and how many
// times in a row a write was refused because the file had changed. The AI never sees any of it.
export class FileVersionTracker {
  private readonly seenVersions = new Map<string, string>();
  private readonly conflictCounts = new Map<string, number>();

  remember(path: string, sha: string): void {
    this.seenVersions.set(path, sha);
  }

  seen(path: string): string | undefined {
    return this.seenVersions.get(path);
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
