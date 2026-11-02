// What the persistent write_file pipeline keeps in SQLite to resume after an interruption. The new content itself
// is the payload of the record.
export type WriteFileData = {
  path: string;
  // SHA of the file as it was when the pipeline started, and of the content it has to produce.
  originalSha: string;
  expectedSha: string;
  backupPath: string;
  // Why the pipeline ended in a failed state, when it did.
  reason?: string;
  error?: string;
};
