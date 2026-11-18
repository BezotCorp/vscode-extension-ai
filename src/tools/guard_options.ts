import type { AccessRequest } from '../permissions';

export type GuardOptions = {
  // The level of access the model announced in its call (see readAccessArg).
  access?: AccessRequest;
  detail?: string;
  effects?: string[];
  // A protected resource found below a directory the operation affects as a whole.
  protectedDescendant?: string;
  signal?: AbortSignal;
};
