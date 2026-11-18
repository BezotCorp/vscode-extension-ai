export function getModelManagementStyles(): string {
  return `
#model-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.settings-group label {
  font-weight: 500;
}

.settings-group input,
.settings-group select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
}

#provider-actions,
#provider-actions-secondary {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

#apply-provider-settings,
#test-connection,
#refresh-models,
#settings {
  padding: 6px 9px;
  border: 0;
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

#apply-provider-settings:hover,
#test-connection:hover,
#refresh-models:hover,
#settings:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

#backend-card {
  padding: 5px 0;
}

#backend-status {
  font-weight: 500;
}

#backend-url,
#model-error {
  margin-top: 4px;
  opacity: 0.75;
  font-size: 0.9em;
  word-break: break-all;
}

#model-error {
  color: var(--vscode-errorForeground);
  opacity: 1;
}

.settings-divider {
  height: 1px;
  background: var(--vscode-panel-border);
}
`;
}
