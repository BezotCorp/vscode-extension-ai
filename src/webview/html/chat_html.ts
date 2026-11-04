import { currentLocale, escapeHtml, t } from '../../i18n';
import { getStyles } from '../css';
import { getChatScript } from '../javascript/chat_script';
import { getModelManagementHtml } from './model_management_html';

// Every visible text is read from the catalog in the display language; the page never mixes two languages.
export function getChatHtml(): string {
  const ui = (key: Parameters<typeof t>[0]): string => escapeHtml(t(key));

  return `<!DOCTYPE html>
<html lang="${currentLocale()}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${getStyles()}
</style>
</head>
<body>

<header id="chat-header">
  <div id="view-title"><span id="view-title-text">${ui('ui.newConversation')}</span></div>

  <div id="header-actions">
    <button
      id="open-history"
      class="header-action"
      type="button"
      title="${ui('ui.history')}"
      aria-label="${ui('ui.history')}"
    >
      ◷
    </button>

    <button
      id="new-chat"
      class="header-action"
      type="button"
      title="${ui('ui.newConversation')}"
      aria-label="${ui('ui.newConversation')}"
    >
      +
    </button>

    <button
      id="open-configuration"
      class="header-action"
      type="button"
      title="${ui('ui.configuration')}"
      aria-label="${ui('ui.configuration')}"
    >
      ⚙
    </button>
  </div>
</header>

<section id="history-drawer" hidden>
  <div id="history-filters">
    <button
      class="history-filter active"
      data-history-filter="active"
      type="button"
    >
      ${ui('ui.filterActive')}
    </button>

    <button
      class="history-filter"
      data-history-filter="archived"
      type="button"
    >
      ${ui('ui.filterArchived')}
    </button>

    <button
      class="history-filter"
      data-history-filter="trash"
      type="button"
    >
      ${ui('ui.filterTrash')}
    </button>
  </div>

  <ul id="history-session-list"></ul>

  <div id="history-empty" hidden>
    ${ui('ui.historyEmpty')}
  </div>

  <div id="history-bulk-actions">
    <button
      id="clear-current-chat"
      class="history-bulk-action"
      type="button"
    >
      ${ui('ui.clearCurrent')}
    </button>

    <button
      id="trash-archived-chats"
      class="history-bulk-action destructive"
      type="button"
      hidden
    >
      ${ui('ui.trashArchived')}
    </button>

    <button
      id="empty-trash"
      class="history-bulk-action destructive"
      type="button"
      hidden
    >
      ${ui('ui.emptyTrash')}
    </button>
  </div>
</section>

<main id="main-content">

  <section id="view-chat" class="view-panel active">
    <div id="backend-alert" hidden>
      <span>${ui('ui.backendUnavailable')}</span>

      <button id="backend-alert-configure" type="button">
        ${ui('ui.openConfiguration')}
      </button>
    </div>

    <div id="messages"></div>

    <div id="composer">
      <div id="composer-toolbar">
        <select
          id="chat-model-select"
          aria-label="${ui('ui.activeModel')}"
        ></select>

        <button
          id="chat-configure-ai"
          type="button"
          hidden
        >
          ${ui('ui.configure')}
        </button>
      </div>

      <div id="input-area">
        <textarea
          id="input"
          placeholder="${ui('ui.placeholder')}"
          rows="1"
        ></textarea>

        <button
          id="send"
          type="button"
          title="${ui('ui.send')}"
          aria-label="${ui('ui.send')}"
        >
          ↑
        </button>

        <button
          id="stop"
          type="button"
          title="${ui('ui.stop')}"
          aria-label="${ui('ui.stop')}"
          disabled
        >
          ■
        </button>
      </div>
    </div>
  </section>

  <section id="view-configuration" class="view-panel">
    ${getModelManagementHtml(ui)}
  </section>

</main>

<script>
${getChatScript()}
</script>

</body>
</html>`;
}
