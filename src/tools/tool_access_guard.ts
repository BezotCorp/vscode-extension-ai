import * as vscode from 'vscode';

import {
  AccessRequest,
  AutonomyMode,
  isProtectedResource,
  PermissionCapability,
  PermissionError,
  PermissionRequest,
  PermissionScope,
  PermissionStore,
  sanitizeForPrompt,
  ToolAccessProfile,
} from '../permissions';
import { describeCriticalPath, ResolvedPath } from '../workspace';
import { GuardOptions } from './guard_options';

const MAX_DETAIL_LINES = 24;
const MAX_DETAIL_LINE_CHARS = 200;

const ALLOW_ONCE = 'Yes';
const ALLOW_SESSION = 'Yes, for this session';
const ALLOW_WORKSPACE = 'Yes, in this workspace';
const ALLOW_ALWAYS = 'Yes, always';
const DENY = 'No';

const REMEMBER_SCOPES: Record<string, PermissionScope> = {
  [ALLOW_SESSION]: 'session',
  [ALLOW_WORKSPACE]: 'workspace',
  [ALLOW_ALWAYS]: 'global',
};

const ACTION_LABELS: Record<PermissionCapability, string> = {
  read: 'read',
  search: 'search',
  create: 'create',
  write: 'modify',
  delete: 'delete',
  move: 'move',
};

// Single gate for every tool operation. Decisions only come from the dialog below and the permission manager,
// never from tool input or output. A tool is controlled by its identity: the decision kept for it (deny at any
// scope, otherwise the most specific scope) or, failing that, its default. Three things are never covered by an
// allow decision: a path outside the current window (elevated access), a protected resource (credentials, keys, .git),
// and a critical location (strong confirmation each time). None of them is let through by any autonomy mode,
// `auto` included.
//
// The level of access an operation needs is worked out here from its paths, never taken from the model: the model
// announces one in its call, but the announcement only matters for a critical operation, where it must carry a
// reason. An announcement that is too low is not an error: the real level is applied and, if it needs an answer from
// the user, the user is asked, without going back to the model.
export class ToolAccessGuard {
  // Effects the user explicitly refused during this generation, with a description of the refusal.
  // A guard lives for one generation (see GenerationController), so a new user message starts with a clean slate.
  private readonly refusedEffects = new Map<string, string>();

  constructor(
    private readonly store: PermissionStore,
    private readonly getMode: () => AutonomyMode,
  ) {}

  get mode(): AutonomyMode {
    return this.getMode();
  }

  async assertReadable(
    tool: ToolAccessProfile,
    resolved: ResolvedPath,
    isDirectory: boolean,
    options: GuardOptions = {},
  ): Promise<void> {
    await this.assertPath(tool, 'read', resolved, isDirectory, options);
  }

  async assertPath(
    tool: ToolAccessProfile,
    capability: PermissionCapability,
    resolved: ResolvedPath,
    isDirectory = false,
    options: GuardOptions = {},
  ): Promise<void> {
    const fsPath = resolved.uri.fsPath;

    await this.authorize(
      {
        tool,
        action: `${ACTION_LABELS[capability]} ${isDirectory ? 'folder' : 'file'} ${sanitizeForPrompt(fsPath)}`,
        resources: [fsPath],
        inPerimeter: resolved.insideCurrentWindow,
        detail: options.detail,
        effects: options.effects,
        access: this.accessFor(capability, [resolved], options.access),
      },
      options.signal,
    );
  }

  // One question for a move, not one per end: both paths are part of the same operation.
  async assertMove(
    tool: ToolAccessProfile,
    source: ResolvedPath,
    destination: ResolvedPath,
    isDirectory: boolean,
    options: GuardOptions = {},
  ): Promise<void> {
    await this.authorize(
      {
        tool,
        action: `move ${isDirectory ? 'folder' : 'file'} ${sanitizeForPrompt(source.uri.fsPath)}`,
        resources: [source.uri.fsPath, destination.uri.fsPath],
        inPerimeter: source.insideCurrentWindow && destination.insideCurrentWindow,
        detail: [`Destination: ${sanitizeForPrompt(destination.uri.fsPath)}`, options.detail]
          .filter(Boolean)
          .join('\n'),
        effects: options.effects,
        access: this.accessFor('move', [source, destination], options.access),
      },
      options.signal,
    );
  }

  // The level the operation really needs. Reading never is critical; changing, creating, deleting or moving can be.
  // The current window is only the perimeter the user opened: a structural workspace (Cargo, monorepo...) around it
  // grants nothing, so going outside the window is elevated whatever the project structure says.
  private accessFor(
    capability: PermissionCapability,
    paths: ResolvedPath[],
    announced?: AccessRequest,
  ): NonNullable<PermissionRequest['access']> {
    const whyCritical =
      capability === 'read' || capability === 'search'
        ? undefined
        : paths.map(describeCriticalPath).find((why) => why !== undefined);

    if (whyCritical !== undefined) {
      return { required: 'critical', announced, whyCritical };
    }

    return { required: paths.every((path) => path.insideCurrentWindow) ? 'normal' : 'elevated', announced };
  }

  // Why a tool is not offered to the model right now, if it is not.
  unavailableReason(tool: ToolAccessProfile): string | undefined {
    if (tool.requiresTrust && !vscode.workspace.isTrusted) {
      return 'the workspace is not trusted';
    }

    if (this.getMode() === 'readOnly' && !tool.readOnlyCompatible) {
      return 'the autonomy mode is read-only';
    }

    return this.store.resolve(tool.permissionKey ?? tool.id)?.policy === 'deny'
      ? 'denied by the user in the permission settings'
      : undefined;
  }

  // Paths that stay out of listings, searches, the context and git output unless the user is asked.
  isProtected(fsPath: string): boolean {
    return isProtectedResource(fsPath) !== undefined;
  }

  async authorize(request: PermissionRequest, signal?: AbortSignal): Promise<void> {
    const { tool } = request;
    const key = tool.permissionKey ?? tool.id;
    const mode = this.getMode();

    if (tool.requiresTrust && !vscode.workspace.isTrusted) {
      throw new PermissionError(
        'policy',
        'workspace_untrusted',
        `The workspace is not trusted, so ${tool.name} cannot be used. Nothing was executed.`,
        request.resources[0],
      );
    }

    const decision = this.store.resolve(key);

    if (decision?.policy === 'deny') {
      throw new PermissionError(
        'policy',
        'denied_by_policy',
        `${tool.name} is denied in the permission settings (${decision.scope}). Nothing was executed. Do not try to reach the same effect another way; tell the user it is not allowed.`,
        request.resources[0],
        { scope: decision.scope },
      );
    }

    if (mode === 'readOnly' && !tool.readOnlyCompatible) {
      throw new PermissionError(
        'policy',
        'read_only_mode',
        `Autonomy mode is read-only: ${tool.name} cannot ${request.action}. Nothing was executed.`,
        request.resources[0],
      );
    }

    this.assertNotRefusedEarlier(request);

    const critical = request.access?.required === 'critical';

    if (critical) {
      this.assertCriticalJustified(request);
    }

    const protection = request.resources.map(isProtectedResource).find((pattern) => pattern !== undefined);
    const policy = decision?.policy ?? tool.permissionDefault;
    const explicitAsk = decision?.policy === 'ask';

    // Outside the current window (elevated) nothing is granted in advance: neither an allow decision nor the
    // acceptEdits or auto modes. Only normal operations follow the ordinary permission and autonomy rules.
    if (!critical && protection === undefined && request.inPerimeter) {
      if (policy === 'allow') {
        return;
      }

      if (mode === 'auto' && !explicitAsk) {
        return;
      }

      if (mode === 'acceptEdits' && tool.editsFiles && !explicitAsk) {
        return;
      }
    }

    const reason = critical
      ? 'This is a critical operation: it always needs your answer, once, in every autonomy mode.'
      : protection
      ? `This touches a protected resource (${protection}), which always needs your answer.`
      : !request.inPerimeter
        ? 'This is outside the current window (elevated access), so a standing permission does not cover it.'
        : explicitAsk
          ? `${tool.name} is set to ask every time.`
          : undefined;
    const answer = await this.ask(request, reason, signal);

    if (answer === undefined) {
      throw new PermissionError(
        'no_decision',
        'permission_not_decided',
        `The permission dialog was closed without a decision to ${request.action}. This is not a refusal. Nothing was executed.`,
        request.resources[0],
      );
    }

    if (answer.choice === DENY) {
      for (const effect of this.effectsOf(request)) {
        this.refusedEffects.set(effect, request.action);
      }

      const feedback = answer.feedback ? ` The user added: "${sanitizeForPrompt(answer.feedback, 500)}".` : '';

      throw new PermissionError(
        'user_refused',
        'user_refused',
        `The user explicitly refused permission to ${request.action}. Nothing was executed.${feedback} Do not retry it or reach the same effect another way; ask the user instead.`,
        request.resources[0],
      );
    }

    const remember = REMEMBER_SCOPES[answer.choice];

    if (remember) {
      await this.store.set(key, 'allow', remember);
    }
  }

  // A critical operation needs the AI to say why it must touch that location. Without it nothing happens and the AI
  // is told exactly what to add: this is the one case where going back to the model is necessary.
  private assertCriticalJustified(request: PermissionRequest): void {
    const announced = request.access?.announced;
    const reason = announced?.kind === 'critical' ? announced.reason.trim() : '';

    if (reason) {
      return;
    }

    throw new PermissionError(
      'policy',
      'critical_justification_required',
      `This operation touches a critical location (${request.access?.whyCritical ?? 'critical'}): ${request.action}. Nothing was executed. If you really need it, call the tool again with access {"kind":"critical","reason":"<why you must touch this location>"}; the user will then be asked to confirm.`,
      request.resources[0],
      { requiredAccess: 'critical', whyCritical: request.access?.whyCritical, correctableByTheModel: true },
    );
  }

  private effectsOf(request: PermissionRequest): string[] {
    return request.effects ?? [`tool:${request.tool.id}:${request.resources.join('|')}`];
  }

  // A refusal covers every route to the same effect: other tools acting on the same resource or host.
  private assertNotRefusedEarlier(request: PermissionRequest): void {
    const earlier = this.effectsOf(request).find((effect) => this.refusedEffects.has(effect));

    if (earlier !== undefined) {
      throw new PermissionError(
        'user_refused',
        'user_refused',
        `The user already explicitly refused this effect earlier in this turn (${this.refusedEffects.get(earlier)}). Nothing was executed. Do not retry it or reach the same effect another way; ask the user instead.`,
        request.resources[0],
        { enforcedFromEarlierRefusal: true },
      );
    }
  }

  // Resolves to the answer, or undefined when the dialog was closed. Rejects if the request is cancelled first.
  private async ask(
    request: PermissionRequest,
    reason: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ choice: string; feedback?: string } | undefined> {
    if (signal?.aborted) {
      throw cancelledWhileWaiting(request);
    }

    const critical = request.access?.required === 'critical';
    const announced = request.access?.announced;
    const detail = [
      critical ? 'CRITICAL OPERATION' : undefined,
      `Tool: ${request.tool.name} (${request.tool.permissionKey ?? request.tool.id})`,
      critical ? `Action: ${request.action}` : undefined,
      critical ? `Target: ${request.resources.map((resource) => sanitizeForPrompt(resource)).join(' -> ')}` : undefined,
      critical ? `Why it is critical: ${request.access?.whyCritical}` : undefined,
      critical && announced?.kind === 'critical' ? `Reason given by the AI: ${sanitizeForPrompt(announced.reason, 500)}` : undefined,
      request.detail ? formatDetail(request.detail) : undefined,
      reason,
      critical
        ? 'Warning: a wrong operation here can damage the system, make a service unusable or cause data loss, and the AI only gave its own reason for it.'
        : undefined,
      request.warning,
      'Closing this dialog is not a refusal: nothing runs and the AI is told no decision was made.',
    ]
      .filter(Boolean)
      .join('\n');
    // A standing decision would not cover this call, or would contradict a rule to ask: only this once.
    const buttons = reason ? [ALLOW_ONCE, DENY] : [ALLOW_ONCE, ALLOW_SESSION, ALLOW_WORKSPACE, ALLOW_ALWAYS, DENY];
    const dialog = Promise.resolve(
      vscode.window.showWarningMessage(`BezotCorp AI wants to ${request.action}`, { modal: true, detail }, ...buttons),
    ).then(async (choice) => {
      if (choice === DENY) {
        // As in Claude Code, a refusal can say what to do instead.
        const feedback = await vscode.window.showInputBox({
          title: 'Refused',
          prompt: 'Tell the AI what to do instead (optional, Escape to skip).',
        });

        return { choice, feedback: feedback?.trim() || undefined };
      }

      return choice === undefined ? undefined : { choice };
    });

    if (!signal) {
      return dialog;
    }

    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(cancelledWhileWaiting(request));
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
}

// Tool-provided detail keeps its line structure (a diff is read line by line), but every line is sanitized and
// the whole is bounded, so it can neither fake extra dialog lines nor flood the dialog.
function formatDetail(detail: string): string {
  const lines = detail.split('\n');
  const shown = lines.slice(0, MAX_DETAIL_LINES).map((line) => sanitizeForPrompt(line, MAX_DETAIL_LINE_CHARS));

  return [...shown, ...(lines.length > MAX_DETAIL_LINES ? [`… ${lines.length - MAX_DETAIL_LINES} more lines`] : [])].join(
    '\n',
  );
}

function cancelledWhileWaiting(request: PermissionRequest): PermissionError {
  return new PermissionError(
    'no_decision',
    'cancelled_while_waiting',
    `The request was cancelled before the user decided whether to ${request.action}. This is not a refusal. Nothing was executed.`,
    request.resources[0],
  );
}
