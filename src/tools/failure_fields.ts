export type FailureFields = {
	reason: string;
	message: string;
	executed: boolean | 'unknown';
	retryable: boolean;
	content?: string;
	details?: Record<string, unknown>;
};
