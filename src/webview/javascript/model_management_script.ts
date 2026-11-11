export function getModelManagementScript(): string {
  return `
const providerSelect = document.getElementById('provider-select');
const providerUrlInput = document.getElementById('provider-url-input');
const applyProviderSettings = document.getElementById('apply-provider-settings');
const refreshModels = document.getElementById('refresh-models');
const modelError = document.getElementById('model-error');

function fillChatModelSelect(models, activeModelId) {
  chatModelSelect.textContent = '';

  if (!Array.isArray(models) || models.length === 0) {
    const option = document.createElement('option');

    option.value = '';
    option.textContent = tr('ui.noModel');
    option.selected = true;

    chatModelSelect.appendChild(option);
    chatModelSelect.disabled = true;
    chatConfigureAi.hidden = false;

    return;
  }

  chatModelSelect.disabled = false;
  chatConfigureAi.hidden = true;

  for (const model of models) {
    const option = document.createElement('option');

    option.value = model.id;
    option.textContent = model.name;
    option.selected = model.id === activeModelId;

    chatModelSelect.appendChild(option);
  }
}

function renderModelState(state) {
  providerSelect.value = state.provider;
  providerUrlInput.value = state.providerUrl;

  modelError.textContent = state.error
    ? tr('ui.modelError', { error: state.error })
    : '';

  fillChatModelSelect(state.models, state.activeModel);
}

function changeModel(model) {
  if (!model || !model.trim()) {
    return;
  }

  vscode.postMessage({
    type: 'changeModel',
    model: model.trim(),
  });
}

function updateProviderSettings() {
  const provider = providerSelect.value;
  const providerUrl = providerUrlInput.value.trim();

  if (!provider || !providerUrl) {
    return;
  }

  vscode.postMessage({
    type: 'updateProviderSettings',
    provider,
    providerUrl,
  });
}

applyProviderSettings.addEventListener('click', updateProviderSettings);

refreshModels.addEventListener('click', () => {
  vscode.postMessage({
    type: 'refreshModels',
  });
});

chatModelSelect.addEventListener('change', () => {
  changeModel(chatModelSelect.value);
});

window.addEventListener('message', (event) => {
  const msg = event.data;

  if (msg.type === 'modelState') {
    renderModelState(msg);
  }
});
`;
}
