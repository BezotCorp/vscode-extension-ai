import { getChatScript } from '../javascript/chat_script';
import { getChatStyles } from '../css/chat_styles';
import { getModelManagementHtml } from './model_management_html';

export function getChatHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${getChatStyles()}
</style>
</head>
<body>
<div id="welcome">
  <strong>BezotCorp AI</strong>
  <p>Use Ollama, your own backend, or the future BezotCorp backend.</p>

  <div id="backend-card">
    <div id="backend-status">🟡 Connecting...</div>
    <div id="backend-url"></div>
    <button id="test-connection">Test Connection</button>
    <button id="settings">Open Settings</button>
  </div>
</div>
${getModelManagementHtml()}
<div id="chat-session-card">
  <div id="chat-session-header">
    <strong>Chats</strong>
    <button id="new-chat">New Chat</button>
  </div>

  <select id="chat-session-select"></select>

  <div id="chat-session-actions">
    <button id="rename-chat">Rename</button>
    <button id="delete-chat">Delete</button>
    <button id="clear-history">Clear Current</button>
  </div>
</div>

<div id="context-card">
  <label>
    <input id="include-selected-text" type="checkbox" checked>
    Include selected text
  </label>
  <div id="selected-text-status">Selected text will be attached when available.</div>

  <label>
    <input id="include-active-file" type="checkbox" checked>
    Include active file
  </label>
  <div id="active-file-status">Active file will be attached when available.</div>

  <label>
    <input id="include-open-files" type="checkbox">
    Include open files
  </label>
  <div id="open-files-status">Open files disabled.</div>

  <label>
    <input id="include-workspace-tree" type="checkbox">
    Include workspace tree
  </label>
  <div id="workspace-tree-status">Workspace tree disabled.</div>
</div>

<div id="context-preview-card">
  <strong>Context</strong>
  <div id="context-mode">Mode: basic</div>
  <div id="context-preview-selected-text">Selected text: none</div>
  <div id="context-preview-active-file">Active file: none</div>
  <div id="context-preview-open-files">Open files: 0</div>
  <div id="context-preview-workspace-files">Workspace files: 0</div>
</div>

<div id="messages"></div>
<div id="input-area">
  <textarea id="input" placeholder="Ask anything..." rows="1"></textarea>
  <button id="send">Send</button>
  <button id="stop" disabled>Stop</button>
</div>

<script>
${getChatScript()}
</script>
</body>
</html>`;
}
