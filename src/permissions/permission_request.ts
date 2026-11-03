import { AccessLevel, AccessRequest, ToolAccessProfile } from '.';

export type PermissionRequest = {
  tool: ToolAccessProfile;
  // What the user is asked about, for example "modify /project/src/a.ts".
  action: string;
  // Absolute paths the operation touches.
  resources: string[];
  // False when a path lies outside every workspace folder: an allow decision does not cover it.
  inPerimeter: boolean;
  // Extra human-readable context shown in the dialog.
  detail?: string;
  // Keys of the effects this operation produces. Defaults to the tool and its resources.
  effects?: string[];
  // Shown after the detail, in the dialog's own words.
  warning?: string;
  // Present for the operations that have levels of access. `required` is what the runtime worked out from the paths
  // and the operation; `announced` is what the model said it needed, which never lowers `required`.
  access?: {
    required: AccessLevel;
    announced?: AccessRequest;
    // For a critical operation, what makes the location critical.
    whyCritical?: string;
  };
};
