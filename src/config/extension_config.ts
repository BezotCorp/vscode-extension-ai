import * as vscode from 'vscode';
import type { McpServerConfig } from '../mcp';
import { type AutonomyMode, DEFAULT_AUTONOMY_MODE } from '../permissions';
import type { AiProviderKind } from './ai_provider_kind';
import {
  DEFAULT_CONTEXT_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_PROVIDER_URL,
  MIN_CONTEXT_TOKENS,
} from './config_provider';

export type ExtensionConfig = {
  provider: AiProviderKind;
  providerUrl: string;
  model: string;
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
