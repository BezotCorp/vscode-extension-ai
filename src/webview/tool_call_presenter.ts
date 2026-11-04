import * as vscode from 'vscode';

import { ChatMessage } from '../chat/chat_message';
import { closingText } from '../chat/message_text';
import { ToolCall, ToolExecutionResult } from '../tools';

const MAX_ARGUMENT_CHARS = 200;

export function sendToolCall(webviewView: vscode.WebviewView, sessionId: string, call: ToolCall): void {
  webviewView.webview.postMessage({
    type: 'responseChunk',
    sessionId,
    text: formatToolCall(call.name, call.arguments),
  });
}

export function sendToolResult(webviewView: vscode.WebviewView, sessionId: string, result: ToolExecutionResult): void {
  webviewView.webview.postMessage({
    type: 'responseChunk',
    sessionId,
    text: formatToolOutcome(result.status, result.reason),
  });
}

export function sendToolNotice(webviewView: vscode.WebviewView, sessionId: string, text: string): void {
  webviewView.webview.postMessage({ type: 'responseChunk', sessionId, text });
}

// What the chat shows for a stored message: the same tool lines that were streamed while it was generated.
export function displayContent(message: ChatMessage): string {
  if (!message.toolRounds?.length) {
    return message.content;
  }

  const rounds = message.toolRounds.map(
    (round) =>
      round.content +
      round.calls
        .map((call) => formatToolCall(call.name, call.arguments) + formatToolOutcome(...readOutcome(call.result)))
        .join(''),
  );

  return rounds.join('') + closingText(message);
}

function formatToolCall(name: string, args: unknown): string {
  return `\n[tool] ${name} ${truncate(JSON.stringify(args ?? {}))}\n`;
}

function formatToolOutcome(status: string, reason: string | undefined): string {
  return `[tool] -> ${status}${reason ? ` (${reason})` : ''}\n\n`;
}

// Stored results can be cut, so the outcome is read from the start of the serialized text rather than parsed.
function readOutcome(serialized: string): [string, string | undefined] {
  const head = serialized.slice(0, 600);

  return [/"status":"([^"]+)"/.exec(head)?.[1] ?? 'unknown', /"reason":"([^"]+)"/.exec(head)?.[1]];
}

function truncate(text: string): string {
  return text.length > MAX_ARGUMENT_CHARS ? `${text.slice(0, MAX_ARGUMENT_CHARS)}...` : text;
}
