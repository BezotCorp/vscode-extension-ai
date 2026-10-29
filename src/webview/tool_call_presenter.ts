import * as vscode from 'vscode';

import { ToolCall, ToolExecutionResult } from '../tools';

const MAX_ARGUMENT_CHARS = 200;

export function sendToolCall(webviewView: vscode.WebviewView, call: ToolCall): void {
  webviewView.webview.postMessage({
    type: 'responseChunk',
    text: `\n[tool] ${call.name} ${truncate(JSON.stringify(call.arguments ?? {}))}\n`,
  });
}

export function sendToolResult(webviewView: vscode.WebviewView, result: ToolExecutionResult): void {
  const reason = result.reason ? ` (${result.reason})` : '';

  webviewView.webview.postMessage({
    type: 'responseChunk',
    text: `[tool] -> ${result.status}${reason}\n\n`,
  });
}

export function sendToolNotice(webviewView: vscode.WebviewView, text: string): void {
  webviewView.webview.postMessage({ type: 'responseChunk', text });
}

function truncate(text: string): string {
  return text.length > MAX_ARGUMENT_CHARS ? `${text.slice(0, MAX_ARGUMENT_CHARS)}...` : text;
}
