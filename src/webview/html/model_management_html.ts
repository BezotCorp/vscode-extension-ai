import type { MessageKey } from "../../i18n";

export function getModelManagementHtml(
	ui: (key: MessageKey) => string,
): string {
	return `
<div id="model-card">
  <div class="settings-group">
    <label for="provider-select">${ui("ui.provider")}</label>

    <select id="provider-select">
      <option value="ollama">Ollama</option>
      <option value="customBackend">${ui("ui.providerCustom")}</option>
      <option value="bezotcorp">BezotCorp</option>
    </select>
  </div>

  <div class="settings-group">
    <label for="provider-url-input">${ui("ui.backendUrl")}</label>

    <input
      id="provider-url-input"
      type="text"
      placeholder="http://127.0.0.1:11434"
    >
  </div>

  <div id="provider-actions">
    <button id="apply-provider-settings" type="button">
      ${ui("ui.apply")}
    </button>

    <button id="test-connection" type="button">
      ${ui("ui.testConnection")}
    </button>
  </div>

  <div id="backend-card">
    <div id="backend-status"></div>
    <div id="backend-url"></div>
  </div>

  <div class="settings-divider"></div>

  <div id="provider-actions-secondary">
    <button id="refresh-models" type="button">
      ${ui("ui.refreshModels")}
    </button>

    <button id="settings" type="button">
      ${ui("ui.advancedSettings")}
    </button>
  </div>

  <div id="model-error"></div>
</div>`;
}
