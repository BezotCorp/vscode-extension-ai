export type WebviewMessage = {
  type: string;
  text?: string;
  sessionId?: string;
  title?: string;
  model?: string;
  includeActiveFile?: boolean;
  includeOpenFiles?: boolean;
  includeSelectedText?: boolean;
  includeWorkspaceTree?: boolean;
  provider?: 'ollama' | 'customBackend' | 'bezotcorp';
  providerUrl?: string;
};
