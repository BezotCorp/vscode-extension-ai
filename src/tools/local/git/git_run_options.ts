export type GitRunOptions = {
  // Arguments after the fixed safety options, built by a tool from validated parameters.
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
};
