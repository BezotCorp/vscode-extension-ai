// How long an explicit permission decision remains valid: until VS Code closes (currentSession) or until it is
// removed (allSessions). The lifetime is never written to disk: it is implied by where a decision is kept.
export type PermissionLifetime = 'currentSession' | 'allSessions';
