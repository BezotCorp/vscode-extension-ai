import { PermissionCapability, PermissionScope } from '.';

export type PermissionRequest = {
  capability: PermissionCapability;
  // What is being accessed right now.
  scope: PermissionScope;
  // Scopes a stored grant can cover, from the narrowest to the widest.
  grantScopes: PermissionScope[];
  // Allowed without any grant or prompt (for example reading inside the workspace).
  implicit?: boolean;
  // Tool performing the operation, shown in the prompt.
  operation?: string;
  // Extra human-readable context shown in the prompt.
  detail?: string;
  // Keys of the effects this operation produces. Defaults to capability and scope.
  effects?: string[];
};
