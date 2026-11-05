import type * as vscode from 'vscode';

import { getExtensionConfig } from '../config/extension_config';
import { t } from '../i18n';
import type { ModelManager } from '../models/model_manager';
import { createProvider } from '../providers/provider_factory';

export async function sendModelState(webviewView: vscode.WebviewView, modelManager: ModelManager): Promise<void> {
	const state = await modelManager.getState();

	webviewView.webview.postMessage({
		type: 'modelState',
		...state,
	});
}

export async function testConnection(webviewView: vscode.WebviewView): Promise<void> {
	const config = getExtensionConfig();

	webviewView.webview.postMessage({
		type: 'backendStatus',
		status: 'connecting',
		backendUrl: config.providerUrl,
		text: t('status.connecting', { provider: config.provider }),
	});

	const provider = createProvider(config);
	const status = await provider.health();

	webviewView.webview.postMessage({
		type: 'backendStatus',
		status: status.status,
		backendUrl: status.providerUrl,
		text: status.text,
	});
}
