// What the persistent write_file pipeline keeps in SQLite to resume after an interruption. The new content itself
// is the payload of the record.
export type WriteFileData = {
  // Stable VS Code resource URI of the file being updated.
  uri: string;

  // SHA of the file as it was when the pipeline started, and of the content it has to produce.
  originalSha: string;
  expectedSha: string;

  // Safety copies live in the extension's own local storage.
  backupPath: string;

  // Why the pipeline ended in a failed state, when it did.
  reason?: string;
  error?: string;
};
