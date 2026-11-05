// Internal mode of ReadFileTool. It is never part of the tool schema: neither the AI nor the user can set it.
//
// 0 = direct low-level call, made because the AI asked to read the file. The content goes to the AI, so the version
//     read is remembered as the version the AI has seen.
// 1 = call made from a composed tool (update_file). It reads what is on the filesystem right now, and nothing is
//     remembered: the content only reaches the AI if the composed tool decides to hand it over.
export type ReadMode = 0 | 1;
