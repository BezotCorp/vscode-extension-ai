export type ToolExecutionContext = {
	signal?: AbortSignal;
	// Largest serialized result the model will receive from this call, in characters. A tool that hands file content to
	// the model and remembers what it handed over needs it to know what really arrives. Absent: the default limit.
	maxResultChars?: number;
};
