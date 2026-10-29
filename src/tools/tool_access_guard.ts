import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  AutonomyMode,
  describeScope,
  PermissionCapability,
  PermissionError,
  PermissionRequest,
  PermissionScope,
  PermissionStore,
  READ_ONLY_CAPABILITIES,
  sanitizeForPrompt,
} from '../permissions';
import { ResolvedPath } from '../workspace';

const ALLOW_ONCE = 'Allow once';
const ALLOW_SESSION = 'Allow for this session';
const ALLOW_ALWAYS = 'Always allow';
const DENY = 'Deny';

const ACTION_LABELS: Record<PermissionCapability, string> = {
  read: 'read',
  search: 'search',
  create: 'create',
  write: 'modify',
  delete: 'delete',
  move: 'move',
  execute: 'run',
  network: 'access the network for',
  mcp: 'call the MCP tool',
};

export type GuardOptions = {
  operation?: string;
  detail?: string;
  effects?: string[];
  signal?: AbortSignal;
};

// Single gate for every tool operation. Grants only come from the dialogs below, never from tool input or output.
export class ToolAccessGuard {
  // Effects the user explicitly refused during the current turn, with a description of the refusal.
  private readonly refusedEffects = new Map<string, string>();

  constructor(
    private readonly store: PermissionStore,
    private readonly getMode: () => AutonomyMode,
  ) {}

  get mode(): AutonomyMode {
    return this.getMode();
  }

  // A new user message starts with a clean slate: earlier refusals no longer apply.
  beginTurn(): void {
    this.refusedEffects.clear();
  }

  async assertReadable(resolved: ResolvedPath, isDirectory: boolean, options: GuardOptions = {}): Promise<void> {
    await this.assertPath('read', resolved, isDirectory, options);
  }

  async assertPath(
    capability: PermissionCapability,
    resolved: ResolvedPath,
    isDirectory = false,
    options: GuardOptions = {},
  ): Promise<void> {
    const fsPath = resolved.uri.fsPath;
    const grantScopes: PermissionScope[] = [{ kind: isDirectory ? 'folder' : 'file', value: fsPath }];

    if (!isDirectory) {
      grantScopes.push({ kind: 'folder', value: path.dirname(fsPath) });
    }

    if (resolved.insideWorkspace && resolved.workspaceRoot) {
      grantScopes.push({ kind: 'workspace', value: resolved.workspaceRoot });
    }

    await this.authorize(
      {
        capability,
        scope: grantScopes[0],
        grantScopes,
        implicit: resolved.insideWorkspace && READ_ONLY_CAPABILITIES.includes(capability),
        operation: options.operation,
        detail: options.detail,
        effects: options.effects,
      },
      options.signal,
    );
  }

  async authorize(request: PermissionRequest, signal?: AbortSignal): Promise<void> {
    if (request.implicit) {
      return;
    }

    const mode = this.getMode();
    const subject = `${ACTION_LABELS[request.capability]} ${describeScope(request.scope)}`;

    if (mode === 'readOnly' && !READ_ONLY_CAPABILITIES.includes(request.capability)) {
      throw new PermissionError(
        'policy',
        'read_only_mode',
        `Autonomy mode is read-only: the AI may not ${subject}. Nothing was executed.`,
        request.scope,
      );
    }

    const effects = request.effects ?? [`${request.capability}:${request.scope.kind}:${request.scope.value}`];
    const earlier = effects.find((effect) => this.refusedEffects.has(effect));

    if (earlier !== undefined) {
      throw new PermissionError(
        'user_refused',
        'user_refused',
        `The user already explicitly refused this effect earlier in this turn (${this.refusedEffects.get(earlier)}). Nothing was executed. Do not retry it or reach the same effect another way; ask the user instead.`,
        request.scope,
        { enforcedFromEarlierRefusal: true },
      );
    }

    if (this.store.isGranted(request.capability, request.scope)) {
      return;
    }

    if (mode === 'auto') {
      return;
    }

    const answer = await this.ask(request, subject, signal);

    if (answer === undefined) {
      throw new PermissionError(
        'no_decision',
        'permission_not_decided',
        `The permission dialog was closed without a decision to ${subject}. This is not a refusal. Nothing was executed.`,
        request.scope,
      );
    }

    if (answer === DENY) {
      for (const effect of effects) {
        this.refusedEffects.set(effect, subject);
      }

      throw new PermissionError(
        'user_refused',
        'user_refused',
        `The user explicitly refused permission to ${subject}. Nothing was executed. Do not retry it or reach the same effect another way; ask the user instead.`,
        request.scope,
      );
    }

    if (answer === ALLOW_ONCE) {
      return;
    }

    const grantScope = await this.pickGrantScope(request);

    if (grantScope) {
      await this.store.grant(request.capability, grantScope, answer === ALLOW_ALWAYS ? 'always' : 'session');
    }
  }

  // Resolves to the clicked button, or undefined when the dialog was closed. Rejects if the request is cancelled first.
  private async ask(request: PermissionRequest, subject: string, signal?: AbortSignal): Promise<string | undefined> {
    if (signal?.aborted) {
      throw cancelledWhileWaiting(subject, request.scope);
    }

    const detail = [
      request.operation ? `Tool: ${request.operation}` : undefined,
      `Permission: ${request.capability}`,
      `Scope: ${describeScope(request.scope)}`,
      request.detail ? sanitizeForPrompt(request.detail, 600) : undefined,
      'Closing this dialog is not a refusal: nothing runs and the AI is told no decision was made.',
    ]
      .filter(Boolean)
      .join('\n');

    const dialog = Promise.resolve(
      vscode.window.showWarningMessage(
        `BezotCorp AI wants to ${subject}`,
        { modal: true, detail },
        ALLOW_ONCE,
        ALLOW_SESSION,
        ALLOW_ALWAYS,
        DENY,
      ),
    );

    if (!signal) {
      return dialog;
    }

    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(cancelledWhileWaiting(subject, request.scope));
      signal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      return await Promise.race([dialog, cancelled]);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  private async pickGrantScope(request: PermissionRequest): Promise<PermissionScope | undefined> {
    if (request.grantScopes.length <= 1) {
      return request.grantScopes[0];
    }

    const items = request.grantScopes.map((scope) => ({ label: describeScope(scope), scope }));
    const picked = await vscode.window.showQuickPick(items, {
      title: `Which ${request.capability} access should this cover?`,
      placeHolder: 'Pick the scope to remember (Escape: allow this time only)',
    });

    return picked?.scope;
  }
}

function cancelledWhileWaiting(subject: string, scope: PermissionScope): PermissionError {
  return new PermissionError(
    'no_decision',
    'cancelled_while_waiting',
    `The request was cancelled before the user decided whether to ${subject}. This is not a refusal. Nothing was executed.`,
    scope,
  );
}
