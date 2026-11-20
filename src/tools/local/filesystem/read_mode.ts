// Internal mode of ReadFileTool. It is never part of the tool schema: neither the AI nor the user can set it.
//
// 0 = direct low-level call, made because the AI asked to read the file. The content goes to the AI, so the version
//     read is remembered as the version the AI has seen.
// 1 = call made from a composed tool that needs the file as it is on the filesystem right now (update_file). Nothing
//     is remembered: the content only reaches the AI if the composed tool decides to hand it over.
// 2 = call made from a composed tool that needs what the user sees, unsaved editor content included (search_text).
//     Nothing is remembered: the AI only receives the lines the composed tool extracts, not the file.
// 3 = re-read, inside one operation, of the current filesystem version (update_file checking, after its dialog,
//     that the file is still what the user approved, or handing the current content back on a conflict). This mode
//     forces filesystem content and remembers nothing. It does not change permission semantics: every acquisition
//     of file content still consults the current permission state before bytes are read.
export const READ_MODE_DIRECT = 0;
export const READ_MODE_COMPOSED = 1;
export const READ_MODE_SEARCH = 2;
export const READ_MODE_RECHECK = 3;

export type ReadMode =
  | typeof READ_MODE_DIRECT
  | typeof READ_MODE_COMPOSED
  | typeof READ_MODE_SEARCH
  | typeof READ_MODE_RECHECK;
