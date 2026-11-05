export const RETRY_AFTER_FAILURE_MS = 30_000;

// A message does not wait longer than this for servers that are still starting; they join at the next message.
export const STARTUP_WAIT_MS = 8_000;

// A server nobody has called for this long is stopped, and restarted on demand.
export const IDLE_STOP_MS = 10 * 60_000;
export const IDLE_CHECK_MS = 60_000;
