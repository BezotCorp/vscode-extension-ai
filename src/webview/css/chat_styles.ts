export function getChatStyles(): string {
  return `
#chat-header {
  flex: none;
  min-height: 46px;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.chat-title-input {
  width: 100%;
  min-width: 0;
  padding: 2px 4px;
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 3px;
  outline: none;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font: inherit;
  font-weight: 600;
}

#view-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

#view-title-text {
  cursor: default;
}

#view-title-text.editable {
  cursor: text;
}

#header-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
}

.header-action {
  width: 30px;
  height: 30px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--vscode-foreground);
  font-size: 17px;
  line-height: 1;
}

.header-action:hover,
.header-action.active {
  background: var(--vscode-toolbar-hoverBackground);
}

#main-content {
  min-height: 0;
  flex: 1;
}

.view-panel {
  display: none;
  width: 100%;
  height: 100%;
}

.view-panel.active {
  display: flex;
}

#view-chat {
  min-height: 0;
  flex-direction: column;
}

#backend-alert {
  flex: none;
  margin: 8px 8px 0;
  padding: 7px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  border-radius: 5px;
  background: var(--vscode-inputValidation-errorBackground);
  color: var(--vscode-inputValidation-errorForeground);
}

#backend-alert[hidden] {
  display: none;
}

#backend-alert-configure {
  padding: 3px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-textLink-foreground);
}

#messages {
  min-height: 0;
  flex: 1;
  padding: 12px 9px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 92%;
  padding: 9px 11px;
  border-radius: 8px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  user-select: text;
}

.user {
  align-self: flex-end;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.assistant {
  align-self: flex-start;
  background: var(--vscode-editor-inactiveSelectionBackground);
}

.message-content {
  white-space: pre-wrap;
  user-select: text;
}

.copy-message {
  display: block;
  margin: 7px 0 0 auto;
  padding: 3px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  opacity: 0.6;
}

.copy-message:hover {
  opacity: 1;
  background: var(--vscode-list-hoverBackground);
}

#composer {
  flex: none;
  padding: 8px;
  border-top: 1px solid var(--vscode-panel-border);
}

#composer-toolbar {
  min-height: 27px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

#chat-model-select {
  min-width: 0;
  max-width: 220px;
  padding: 3px 6px;
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
}

#chat-configure-ai {
  padding: 3px 6px;
  border: 0;
  background: transparent;
  color: var(--vscode-textLink-foreground);
}

#input-area {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 5px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 7px;
  background: var(--vscode-input-background);
}

#input-area:focus-within {
  border-color: var(--vscode-focusBorder);
}

#input {
  min-width: 0;
  min-height: 30px;
  max-height: 160px;
  flex: 1;
  padding: 5px;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--vscode-input-foreground);
}

#send,
#stop {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  font-weight: 600;
}

#send:hover,
#stop:hover {
  background: var(--vscode-button-hoverBackground);
}

#send:disabled,
#stop:disabled {
  cursor: default;
  opacity: 0.45;
}

#view-configuration {
  min-height: 0;
  padding: 10px;
  overflow-y: auto;
  flex-direction: column;
  gap: 10px;
}

#history-drawer {
  flex: none;
  max-height: 260px;
  margin: 0 8px 6px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 7px;
  background: var(--vscode-sideBar-background);
}

#history-drawer[hidden] {
  display: none;
}

#history-filters {
  flex: none;
  display: flex;
  gap: 3px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.history-filter {
  padding: 6px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--vscode-foreground);
  opacity: 0.65;
}

.history-filter:hover {
  opacity: 1;
  background: var(--vscode-list-hoverBackground);
}

.history-filter.active {
  opacity: 1;
  border-bottom-color: var(--vscode-focusBorder);
}

#history-session-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-session-item {
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  border-radius: 5px;
}

.history-session-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.history-session-item.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.history-session-main {
  min-width: 0;
  flex: 1;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.history-session-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-session-count {
  flex: none;
  opacity: 0.5;
  font-size: 0.85em;
}

.history-session-actions {
  position: relative;
  flex: none;
}

.history-session-menu-button {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 18px;
}

.history-session-menu-button:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.history-session-menu {
  position: fixed;
  z-index: 20;
  min-width: 180px;
  max-width: calc(100vw - 12px);
  padding: 4px;
  border: 1px solid var(--vscode-menu-border);
  border-radius: 5px;
  background: var(--vscode-menu-background);
  color: var(--vscode-menu-foreground);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.history-session-menu[hidden] {
  display: none;
}

.history-menu-action {
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  text-align: left;
}

.history-menu-action:hover {
  background: var(--vscode-menu-selectionBackground);
  color: var(--vscode-menu-selectionForeground);
}

.history-menu-action.destructive {
  color: var(--vscode-errorForeground);
}

#history-empty {
  padding: 10px 2px;
  opacity: 0.6;
}

#history-empty[hidden] {
  display: none;
}

#history-bulk-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--vscode-panel-border);
}

.history-bulk-action {
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  text-align: left;
}

.history-bulk-action:hover:not(:disabled) {
  background: var(--vscode-list-hoverBackground);
}

.history-bulk-action.destructive {
  color: var(--vscode-errorForeground);
}

.history-bulk-action:disabled {
  cursor: default;
  opacity: 0.45;
}
`;
}
