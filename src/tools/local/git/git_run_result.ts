export type GitRunResult = {
	// False when git could not be launched at all (for example it is not installed).
	started: boolean;
	spawnError?: { code?: string; message: string };
	exitCode: number | null;
	terminatedBySignal: string | null;
	timedOut: boolean;
	aborted: boolean;
	stdout: string;
	stderr: string;
	truncated: boolean;
	durationMs: number;
};
