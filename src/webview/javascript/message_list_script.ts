export function getMessageListScript(): string {
  return `
let currentAssistantMessage = null;

function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = 'message ' + role;
  const content = document.createElement('span');
  content.className = 'message-content';
  content.textContent = text;
  div.appendChild(content);

  if (role === 'assistant') {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-message';
    copy.textContent = 'Copier';
    copy.title = 'Copier la réponse';
    copy.addEventListener('click', () => {
      vscode.postMessage({
        type: 'copyMessage',
        text: content.textContent || '',
      });
    });
    div.appendChild(copy);
  }

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function clearMessages() {
  messages.textContent = '';
  currentAssistantMessage = null;
  patchPreviewContainer.textContent = '';
}

function restoreHistory(restoredMessages) {
  clearMessages();

  for (const message of restoredMessages) {
    addMessage(message.content, message.role);
  }
}

function setGenerating(isGenerating) {
  send.disabled = isGenerating;
  stop.disabled = !isGenerating;
}

function startAssistantMessage() {
  currentAssistantMessage = addMessage('', 'assistant');
  setGenerating(true);
}

function appendAssistantChunk(text) {
  if (!currentAssistantMessage) {
    startAssistantMessage();
  }

  const content = currentAssistantMessage.querySelector('.message-content');
  if (content) {
    content.textContent += text;
  }
  messages.scrollTop = messages.scrollHeight;
}

function endAssistantMessage() {
  currentAssistantMessage = null;
  setGenerating(false);
}
`;
}
