// What the AI asked update_file to do: replace one exact piece of text, or replace the whole content.
export type UpdateRequest = { kind: 'edit'; oldText: string; newText: string } | { kind: 'replace'; content: string };
