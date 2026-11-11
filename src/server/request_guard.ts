import type * as http from 'node:http';

// The bridge is meant for programs on this machine, not for web pages. A browser always adds an Origin header to
// cross-site requests, and a page using DNS rebinding sends a Host that is not the loopback address.
export function isLocalProgramRequest(req: http.IncomingMessage): boolean {
  if (req.headers.origin !== undefined) {
    return false;
  }

  const host = (req.headers.host ?? '').toLowerCase();

  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
}
