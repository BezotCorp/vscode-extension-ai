// readOnly: only read and search tools. confirm: ask before anything but reading the workspace.
// acceptEdits: file changes inside the workspace go ahead, everything else asks. auto: nothing is asked.
// Deny rules apply in every mode.
export type AutonomyMode = 'readOnly' | 'confirm' | 'acceptEdits' | 'auto';
