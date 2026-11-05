import { AccessRequest } from ".";

// normal: inside the current window (the perimeter the interface currently has open), under the ordinary permissions.
// elevated: outside the current window, always an explicit answer.
// critical: writing, deleting or moving a critical location (see describeCriticalPath), a strong confirmation each time.
export type AccessLevel = AccessRequest["kind"];
