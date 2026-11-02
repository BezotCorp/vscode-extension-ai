// What ReadFileTool read. `sha` is the SHA-256 of the bytes read; it stays internal and is never shown to the AI.
export type FileRead = {
  text: string;
  sha: string;
  binary: boolean;
  source: 'disk' | 'editor_buffer';
  unsavedChanges: boolean;
};
