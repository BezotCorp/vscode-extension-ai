// Effect keys let a refusal cover equivalent operations on the same resource,
// for example refusing write_file on a path also covers create_file on that path.
export const contentEffect = (fsPath: string): string => `content:${fsPath}`;
export const removalEffect = (fsPath: string): string => `removal:${fsPath}`;
