import { AccessRequest } from '../permissions';

export type GuardOptions = {
  // The level of access the model announced in its call (see readAccessArg).
  access?: AccessRequest;
  detail?: string;
  effects?: string[];
  signal?: AbortSignal;
};
