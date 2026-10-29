// timeout: no answer in time. cancelled: cancelled by the caller. closed: the server exited or the pipe broke.
// not_running: the server was already stopped. protocol: the server answered with a JSON-RPC error.
export type McpRequestErrorKind = 'timeout' | 'cancelled' | 'closed' | 'not_running' | 'protocol';

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
