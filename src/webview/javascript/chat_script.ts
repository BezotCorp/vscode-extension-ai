import { webviewStrings } from '../../i18n';
import { getMessageListScript } from './message_list_script';
import { getModelManagementScript } from './model_management_script';

// The strings are put in the page as data (never spliced into code), with `<` escaped so they cannot close the script.
function serialize(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

export function getChatScript(): string {
	return `
const vscode = acquireVsCodeApi();

const STRINGS = ${serialize(webviewStrings())};

// Looks a string up and fills its {placeholders}.
function tr(key, params) {
  return (STRINGS[key] ?? key).replace(
    /\\{(\\w+)\\}/g,
    (placeholder, name) =>
      params && name in params
        ? String(params[name])
        : placeholder,
  );
}

const MAX_RECENT_CHAT_SESSIONS = 5;

const messages = document.getElementById('messages');
const input = document.getElementById('input');
const send = document.getElementById('send');
const stop = document.getElementById('stop');

const viewTitle = document.getElementById('view-title');
const viewTitleText = document.getElementById('view-title-text');

const openHistory = document.getElementById('open-history');
const newChat = document.getElementById('new-chat');
const openConfiguration = document.getElementById('open-configuration');

const viewPanels = document.querySelectorAll('.view-panel');

const historyDrawer = document.getElementById('history-drawer');
const historySessionList = document.getElementById('history-session-list');
const historyEmpty = document.getElementById('history-empty');
const historyFilters = document.querySelectorAll('.history-filter');

const clearCurrentChat =
  document.getElementById('clear-current-chat');
const trashArchivedChats =
  document.getElementById('trash-archived-chats');
const emptyTrash =
  document.getElementById('empty-trash');

const settings = document.getElementById('settings');
const testConnection = document.getElementById('test-connection');

const backendStatus = document.getElementById('backend-status');
const backendUrl = document.getElementById('backend-url');
const backendAlert = document.getElementById('backend-alert');
const backendAlertConfigure = document.getElementById('backend-alert-configure');

const chatModelSelect = document.getElementById('chat-model-select');
const chatConfigureAi = document.getElementById('chat-configure-ai');

let currentView = 'chat';
let activeSessionId = undefined;
let chatSessions = [];
let historyFilter = 'active';

${getMessageListScript()}

${getModelManagementScript()}

function activeSessions() {
  return chatSessions.filter(
    (session) =>
      !session.archivedAt &&
      !session.trashedAt,
  );
}

function archivedSessions() {
  return chatSessions.filter(
    (session) =>
      Boolean(session.archivedAt) &&
      !session.trashedAt,
  );
}

function trashedSessions() {
  return chatSessions.filter(
    (session) => Boolean(session.trashedAt),
  );
}

function getActiveSession() {
  return chatSessions.find(
    (session) => session.id === activeSessionId,
  );
}

function updateViewTitle() {
  if (currentView === 'configuration') {
    viewTitleText.textContent = tr('ui.configuration');
    viewTitleText.classList.remove('editable');
    return;
  }

  const session = getActiveSession();

  viewTitleText.textContent = session
    ? session.title
    : tr('ui.newConversation');

  viewTitleText.classList.add('editable');
}

function switchView(viewName) {
  currentView = viewName;

  for (const panel of viewPanels) {
    panel.classList.toggle(
      'active',
      panel.id === 'view-' + viewName,
    );
  }

  openConfiguration.classList.toggle(
    'active',
    viewName === 'configuration',
  );

  updateViewTitle();

  if (viewName === 'chat') {
    input.focus();
  }
}

function openHistoryPanel() {
  historyDrawer.hidden = false;
  openHistory.classList.add('active');
  viewTitleText.classList.remove('editable');
  renderHistory();
}

function closeHistoryPanel() {
  historyDrawer.hidden = true;
  openHistory.classList.remove('active');
  updateViewTitle();
}

function sendMessage() {
  if (send.disabled) {
    return;
  }

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
  });
}

function renderHistory() {
  closeHistoryMenus();
  historySessionList.textContent = '';

  let sessions;

  if (historyFilter === 'archived') {
    sessions = archivedSessions()
      .slice()
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
      );
  } else if (historyFilter === 'trash') {
    sessions = trashedSessions()
      .slice()
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
      );
  } else {
    sessions = activeSessions()
      .filter((session) => session.messageCount > 0)
      .slice()
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, MAX_RECENT_CHAT_SESSIONS);
  }

  historyEmpty.hidden = sessions.length !== 0;

  const activeSession = getActiveSession();

  clearCurrentChat.hidden =
    !activeSession ||
    activeSession.messageCount === 0;
  trashArchivedChats.hidden =
    historyFilter !== 'archived';
  emptyTrash.hidden =
    historyFilter !== 'trash';

  trashArchivedChats.disabled =
    archivedSessions().length === 0;

  emptyTrash.disabled =
    trashedSessions().length === 0;

  for (const session of sessions) {
    const item = document.createElement('li');
    item.className = 'history-session-item';

    if (session.id === activeSessionId) {
      item.classList.add('active');
    }

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'history-session-main';

    const title = document.createElement('span');
    title.className = 'history-session-title';
    title.textContent = session.title;

    const count = document.createElement('span');
    count.className = 'history-session-count';
    count.textContent = String(session.messageCount);

    main.appendChild(title);
    main.appendChild(count);

    if (
      !session.archivedAt &&
      !session.trashedAt
    ) {
      main.addEventListener('click', () => {
        vscode.postMessage({
          type: 'switchChatSession',
          sessionId: session.id,
        });

        closeHistoryPanel();
        switchView('chat');
      });
    }

    const actions = document.createElement('div');
    actions.className = 'history-session-actions';

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className =
      'history-session-menu-button';
    menuButton.textContent = '⋯';

    menuButton.setAttribute(
      'aria-label',
      tr('ui.actionsFor', { title: session.title }),
    );

    const menu = document.createElement('div');
    menu.className = 'history-session-menu';
    menu.hidden = true;

    menuButton.addEventListener(
      'click',
      (event) => {
        event.stopPropagation();

        const wasHidden = menu.hidden;

        closeHistoryMenus();

        if (!wasHidden) {
          return;
        }

        menu.hidden = false;
        positionHistoryMenu(menuButton, menu);
      },
    );

    if (session.trashedAt) {
      menu.appendChild(
        createHistoryAction(
          tr('ui.restore'),
          () => {
            vscode.postMessage({
              type: 'restoreTrashedChatSession',
              sessionId: session.id,
            });
          },
        ),
      );

      menu.appendChild(
        createHistoryAction(
          tr('ui.deleteForever'),
          () => {
            vscode.postMessage({
              type: 'deleteChatSession',
              sessionId: session.id,
            });
          },
          true,
        ),
      );
    } else if (session.archivedAt) {
      menu.appendChild(
        createHistoryAction(
          tr('ui.restore'),
          () => {
            vscode.postMessage({
              type: 'restoreChatSession',
              sessionId: session.id,
            });
          },
        ),
      );

      menu.appendChild(
        createHistoryAction(
          tr('ui.moveToTrash'),
          () => {
            vscode.postMessage({
              type: 'trashChatSession',
              sessionId: session.id,
            });
          },
          true,
        ),
      );
    } else {
      menu.appendChild(
        createHistoryAction(
          tr('ui.rename'),
          () => renameSession(session, title),
        ),
      );

      menu.appendChild(
        createHistoryAction(
          tr('ui.archive'),
          () => {
            vscode.postMessage({
              type: 'archiveChatSession',
              sessionId: session.id,
            });
          },
        ),
      );

      menu.appendChild(
        createHistoryAction(
          tr('ui.moveToTrash'),
          () => {
            vscode.postMessage({
              type: 'trashChatSession',
              sessionId: session.id,
            });
          },
          true,
        ),
      );
    }

    actions.appendChild(menuButton);
    actions.appendChild(menu);

    item.appendChild(main);
    item.appendChild(actions);

    historySessionList.appendChild(item);
  }
}

function closeHistoryMenus() {
  for (
    const menu of document.querySelectorAll(
      '.history-session-menu',
    )
  ) {
    menu.hidden = true;
  }
}

function positionHistoryMenu(button, menu) {
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 6;

  const left = Math.min(
    Math.max(
      margin,
      buttonRect.right - menuRect.width,
    ),
    window.innerWidth -
      menuRect.width -
      margin,
  );

  const roomBelow =
    window.innerHeight -
    buttonRect.bottom -
    margin;

  const top =
    roomBelow >= menuRect.height
      ? buttonRect.bottom + 4
      : Math.max(
          margin,
          buttonRect.top -
            menuRect.height -
            4,
        );

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function createHistoryAction(
  label,
  action,
  destructive = false,
) {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'history-menu-action';
  button.textContent = label;

  if (destructive) {
    button.classList.add('destructive');
  }

  button.addEventListener('click', () => {
    action();
  });

  return button;
}

function renameSession(session, target) {
  if (target.querySelector('input')) {
    return;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-title-input';
  input.value = session.title;

  target.textContent = '';
  target.appendChild(input);

  input.focus();
  input.select();

  let finished = false;

  const finish = (save) => {
    if (finished) {
      return;
    }

    finished = true;

    const title = input.value.trim();

    if (!save || !title) {
      target.textContent = session.title;
      return;
    }

    target.textContent = title;

    if (title === session.title) {
      return;
    }

    vscode.postMessage({
      type: 'renameChatSession',
      sessionId: session.id,
      title,
    });
  };

  input.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  input.addEventListener('keydown', (event) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });

  input.addEventListener('blur', () => {
    finish(true);
  });
}

function renderChatSessions(
  sessions,
  nextActiveSessionId,
) {
  chatSessions = sessions;
  activeSessionId = nextActiveSessionId;

  renderHistory();
  updateViewTitle();
}

function updateBackendStatus(
  status,
  text,
  url,
) {
  backendStatus.textContent = text || '';

  backendUrl.textContent = url
    ? tr('ui.urlLabel', { url })
    : '';

  backendAlert.hidden = status !== 'disconnected';
}

viewTitleText.addEventListener('click', () => {
  if (
    currentView !== 'chat' ||
    !historyDrawer.hidden
  ) {
    return;
  }

  const session = getActiveSession();

  if (!session) {
    return;
  }

  renameSession(session, viewTitleText);
});

openHistory.addEventListener('click', () => {
  if (historyDrawer.hidden) {
    openHistoryPanel();
  } else {
    closeHistoryPanel();
  }
});

openConfiguration.addEventListener('click', () => {
  closeHistoryPanel();

  switchView(
    currentView === 'configuration'
      ? 'chat'
      : 'configuration',
  );
});

newChat.addEventListener('click', () => {
  vscode.postMessage({
    type: 'newChat',
  });

  closeHistoryPanel();
  switchView('chat');
});

for (const filter of historyFilters) {
  filter.addEventListener('click', () => {
    historyFilter = filter.dataset.historyFilter;

    for (const candidate of historyFilters) {
      candidate.classList.toggle(
        'active',
        candidate === filter,
      );
    }

    renderHistory();
  });
}

clearCurrentChat.addEventListener('click', () => {
  vscode.postMessage({
    type: 'clearCurrentSession',
  });
});

trashArchivedChats.addEventListener(
  'click',
  () => {
    vscode.postMessage({
      type: 'trashArchivedSessions',
    });
  },
);

emptyTrash.addEventListener('click', () => {
  vscode.postMessage({
    type: 'emptyTrash',
  });
});

historyDrawer.addEventListener(
  'scroll',
  closeHistoryMenus,
  true,
);

window.addEventListener(
  'resize',
  closeHistoryMenus,
);

backendAlertConfigure.addEventListener('click', () => {
  switchView('configuration');
});

chatConfigureAi.addEventListener('click', () => {
  switchView('configuration');
});

settings.addEventListener('click', () => {
  vscode.postMessage({
    type: 'openSettings',
  });
});

testConnection.addEventListener('click', () => {
  vscode.postMessage({
    type: 'testConnection',
  });
});

stop.addEventListener('click', () => {
  vscode.postMessage({
    type: 'stopGeneration',
  });
});

send.addEventListener('click', sendMessage);

input.addEventListener('keydown', (event) => {
  if (
    event.key === 'Enter' &&
    !event.shiftKey
  ) {
    event.preventDefault();
    sendMessage();
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
});

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const target = event.target;

  if (target.closest('.history-session-actions')) {
    return;
  }

  const openMenus = Array.from(
    document.querySelectorAll('.history-session-menu'),
  ).filter((menu) => !menu.hidden);

  if (openMenus.length > 0) {
    closeHistoryMenus();
    return;
  }

  if (
    !historyDrawer.hidden &&
    !target.closest('#history-drawer') &&
    !target.closest('#open-history') &&
    !target.closest('#view-title-text')
  ) {
    closeHistoryPanel();
  }
});

window.addEventListener('message', (event) => {
  const msg = event.data;

  if (msg.type === 'chatStoreRestored') {
    renderChatSessions(
      msg.sessions,
      msg.activeSessionId,
    );

    restoreMessages(msg.messages);
  }

  if (
    msg.type === 'responseStart' &&
    msg.sessionId === activeSessionId
  ) {
    startAssistantMessage();
  }

  if (
    msg.type === 'responseChunk' &&
    msg.sessionId === activeSessionId
  ) {
    appendAssistantChunk(msg.text);
  }

  if (msg.type === 'responseEnd') {
    endAssistantMessage();
  }

  if (msg.type === 'responseStopped') {
    endAssistantMessage();
  }

  if (msg.type === 'backendStatus') {
    updateBackendStatus(
      msg.status,
      msg.text,
      msg.backendUrl,
    );
  }
});

vscode.postMessage({
  type: 'webviewReady',
});
`;
}
