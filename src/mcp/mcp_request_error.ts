import type { McpRequestErrorKind } from './mcp_request_error_kind';

export class McpRequestError extends Error {
	constructor(
		readonly kind: McpRequestErrorKind,
		message: string,
		readonly code?: number,
		readonly stderrTail?: string,
	) {
		super(message);
		this.name = 'McpRequestError';
	}
}
