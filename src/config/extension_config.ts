import * as vscode from 'vscode';

import { McpServerConfig } from '../mcp';
import { AutonomyMode, DEFAULT_AUTONOMY_MODE } from '../permissions';

export type AiProviderKind = 'ollama' | 'customBackend' | 'bezotcorp';
export type ContextMode = 'basic' | 'rich';

export const DEFAULT_PROVIDER: AiProviderKind = 'ollama';
export const DEFAULT_PROVIDER_URL = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5-coder:7b';
export const DEFAULT_CONTEXT_MODE: ContextMode = 'basic';
export const DEFAULT_CONTEXT_TOKENS = 16_384;
export const MIN_CONTEXT_TOKENS = 2_048;

export type ExtensionConfig = {
  provider: AiProviderKind;
  providerUrl: string;
  model: string;
  contextMode: ContextMode;
  autonomyMode: AutonomyMode;
  // Context window requested from the model, in tokens (the model's own maximum applies if it is lower).
  contextTokens: number;
  mcpServers: Record<string, McpServerConfig>;
};

export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('bezotcorpAi');

  return {
    provider: config.get<AiProviderKind>('provider', DEFAULT_PROVIDER),
    providerUrl: normalizeProviderUrl(config.get<string>('providerUrl', DEFAULT_PROVIDER_URL)),
    model: config.get<string>('model', DEFAULT_MODEL),
    contextMode: config.get<ContextMode>('contextMode', DEFAULT_CONTEXT_MODE),
    autonomyMode: getUserSetting<AutonomyMode>('autonomyMode', DEFAULT_AUTONOMY_MODE),
    contextTokens: Math.max(config.get<number>('contextTokens', DEFAULT_CONTEXT_TOKENS), MIN_CONTEXT_TOKENS),
    mcpServers: getUserSetting<Record<string, McpServerConfig>>('mcpServers', {}),
  };
}

// Security-sensitive settings are read from user settings only, so a workspace (or a tool writing
// .vscode/settings.json) cannot raise autonomy or declare programs to launch.
function getUserSetting<T>(key: string, fallback: T): T {
  const inspected = vscode.workspace.getConfiguration('bezotcorpAi').inspect<T>(key);

  return inspected?.globalValue ?? fallback;
}

export async function updateExtensionModel(model: string): Promise<void> {
  const cleanModel = model.trim();

  if (!cleanModel) {
    return;
  }

  await vscode.workspace.getConfiguration('bezotcorpAi').update('model', cleanModel, vscode.ConfigurationTarget.Global);
}

export async function updateExtensionProvider(provider: AiProviderKind): Promise<void> {
  await vscode.workspace
    .getConfiguration('bezotcorpAi')
    .update('provider', provider, vscode.ConfigurationTarget.Global);
}

export async function updateExtensionProviderUrl(providerUrl: string): Promise<void> {
  const cleanProviderUrl = normalizeProviderUrl(providerUrl);

  if (!cleanProviderUrl) {
    return;
  }

  await vscode.workspace
    .getConfiguration('bezotcorpAi')
    .update('providerUrl', cleanProviderUrl, vscode.ConfigurationTarget.Global);
}

export async function updateExtensionProviderSettings(provider: AiProviderKind, providerUrl: string): Promise<void> {
  await updateExtensionProvider(provider);
  await updateExtensionProviderUrl(providerUrl);
}

function normalizeProviderUrl(providerUrl: string): string {
  return providerUrl.trim().replace(/\/$/, '');
}
