import { getContextPreviewScript } from './context_preview_script';
import { getMessageListScript } from './message_list_script';
import { getModelManagementScript } from './model_management_script';

export function getChatScript(): string {
  return `
const vscode = acquireVsCodeApi();

const messages = document.getElementById('messages');
const input = document.getElementById('input');
const send = document.getElementById('send');
const stop = document.getElementById('stop');
const settings = document.getElementById('settings');
const testConnection = document.getElementById('test-connection');
const clearHistory = document.getElementById('clear-history');
const backendStatus = document.getElementById('backend-status');
const backendUrl = document.getElementById('backend-url');
const newChat = document.getElementById('new-chat');
const renameChat = document.getElementById('rename-chat');
const deleteChat = document.getElementById('delete-chat');
const chatSessionSelect = document.getElementById('chat-session-select');
const includeSelectedText = document.getElementById('include-selected-text');
const includeActiveFile = document.getElementById('include-active-file');
const includeOpenFiles = document.getElementById('include-open-files');
const includeWorkspaceTree = document.getElementById('include-workspace-tree');
const selectedTextStatus = document.getElementById('selected-text-status');
const activeFileStatus = document.getElementById('active-file-status');
const openFilesStatus = document.getElementById('open-files-status');
const workspaceTreeStatus = document.getElementById('workspace-tree-status');
const contextMode = document.getElementById('context-mode');
const contextPreviewSelectedText = document.getElementById('context-preview-selected-text');
const contextPreviewActiveFile = document.getElementById('context-preview-active-file');
const contextPreviewOpenFiles = document.getElementById('context-preview-open-files');
const contextPreviewWorkspaceFiles = document.getElementById('context-preview-workspace-files');

let activeSessionId = undefined;
let chatSessions = [];

${getMessageListScript()}

${getContextPreviewScript()}

${getModelManagementScript()}

function sendMessage() {
  const text = input.value.trim();

  if (!text) {
    return;
  }

  addMessage(text, 'user');
  input.value = '';
  input.style.height = 'auto';
  setGenerating(true);

  vscode.postMessage({
    type: 'chat',
    text,
    ...getContextOptions(),
  });
}

function renderChatSessions(sessions, nextActiveSessionId) {
  chatSessions = sessions;
  activeSessionId = nextActiveSessionId;
  chatSessionSelect.textContent = '';

  for (const session of sessions) {
    const option = document.createElement('option');
    option.value = session.id;
    option.textContent = session.title + ' (' + session.messageCount + ')';
    option.selected = session.id === activeSessionId;

    chatSessionSelect.appendChild(option);
  }
}

function getActiveSession() {
  return chatSessions.find((session) => session.id === activeSessionId);
}

function updateBackendStatus(status, text, url) {
  const icons = {
    connected: '🟢',
    disconnected: '🔴',
    connecting: '🟡',
  };

  backendStatus.textContent = (icons[status] ?? '🟡') + ' ' + text;
  backendUrl.textContent = url ? 'Backend: ' + url : '';
}

settings.addEventListener('click', () => {
  vscode.postMessage({ type: 'openSettings' });
});

testConnection.addEventListener('click', () => {
  vscode.postMessage({ type: 'testConnection' });
});

newChat.addEventListener('click', () => {
  vscode.postMessage({ type: 'newChat' });
});

chatSessionSelect.addEventListener('change', () => {
  vscode.postMessage({
    type: 'switchChatSession',
    sessionId: chatSessionSelect.value,
  });
});

renameChat.addEventListener('click', () => {
  const session = getActiveSession();

  if (!session) {
    return;
  }

  const title = prompt('Rename chat', session.title);

  if (!title || !title.trim()) {
    return;
  }

  vscode.postMessage({
    type: 'renameChatSession',
    sessionId: session.id,
    title: title.trim(),
  });
});

deleteChat.addEventListener('click', () => {
  const session = getActiveSession();

  if (!session) {
    return;
  }

  const confirmed = confirm('Delete this chat?');

  if (!confirmed) {
    return;
  }

  vscode.postMessage({
    type: 'deleteChatSession',
    sessionId: session.id,
  });
});

clearHistory.addEventListener('click', () => {
  vscode.postMessage({ type: 'clearHistory' });
});

stop.addEventListener('click', () => {
  vscode.postMessage({ type: 'stopGeneration' });
});

includeSelectedText.addEventListener('change', refreshContextPreview);
includeActiveFile.addEventListener('change', refreshContextPreview);
includeOpenFiles.addEventListener('change', refreshContextPreview);
includeWorkspaceTree.addEventListener('change', refreshContextPreview);

send.addEventListener('click', sendMessage);

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
});

window.addEventListener('message', (event) => {
  const msg = event.data;

  if (msg.type === 'chatStoreRestored') {
    renderChatSessions(msg.sessions, msg.activeSessionId);
    restoreHistory(msg.messages);
  }

  if (msg.type === 'historyRestored') {
    restoreHistory(msg.messages);
  }

  if (msg.type === 'response') {
    addMessage(msg.text, 'assistant');
    setGenerating(false);
  }

  if (msg.type === 'responseStart') {
    startAssistantMessage();
  }

  if (msg.type === 'responseChunk') {
    appendAssistantChunk(msg.text);
  }

  if (msg.type === 'responseEnd') {
    endAssistantMessage();
  }

  if (msg.type === 'responseStopped') {
    endAssistantMessage();
  }

  if (msg.type === 'backendStatus') {
    updateBackendStatus(msg.status, msg.text, msg.backendUrl);
  }

  if (msg.type === 'contextPreview') {
    updateContextPreview(
      msg.mode,
      msg.activeFilePath,
      msg.selectedTextLength,
      msg.openFilesCount,
      msg.workspaceFilesCount,
    );
  }
});

refreshContextPreview();
`;
}
