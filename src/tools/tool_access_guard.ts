import * as vscode from 'vscode';

import {
  AccessRequest,
  AutonomyMode,
  isProtectedResource,
  PermissionCapability,
  PermissionError,
  PermissionRequest,
  PermissionStore,
  sanitizeForPrompt,
  ToolAccessProfile,
} from '../permissions';
import {
  describeCriticalPath,
  ResolvedPath,
  resourcePath,
  StructuralWorkspace,
} from '../workspace';
import { MessageKey, t } from '../i18n';
import { GuardOptions } from './guard_options';

const MAX_DETAIL_LINES = 24;
const MAX_DETAIL_LINE_CHARS = 200;

// The dialog buttons are read when a dialog opens, in the language VS Code is displayed in. The answer is compared
// with the same labels, so a button is always recognised.
const buttons = {
  get allowOnce() { return t('dialog.button.yes'); },
  get allowToolCurrentSession() { return t('dialog.button.toolCurrent'); },
  get allowToolAllSessions() { return t('dialog.button.toolAll'); },
  get allowResourcesCurrentSession() { return t('dialog.button.resourcesCurrent'); },
  get allowResourcesAllSessions() { return t('dialog.button.resourcesAll'); },
  get allowWorkspaceCurrentSession() { return t('dialog.button.workspaceCurrent'); },
  get allowWorkspaceAllSessions() { return t('dialog.button.workspaceAll'); },
  get deny() { return t('dialog.button.no'); },
};

// English verbs of the action the model reads (the dialog has its own, translated).
const ACTION_LABELS:
  Record<PermissionCapability, string> = {
    read: 'read',
    search: 'search',
    create: 'create',
    write: 'modify',
    delete: 'delete',
    move: 'move',
  };

// What the model reads about a refusal that comes from a stored decision: stable English, not a UI label.
const LIFETIME_FOR_MODEL = {
  currentSession: 'current session',
  allSessions: 'all sessions',
} as const;

// `describeCriticalPath` answers in English because the model reads it too; the dialog shows it translated.
const CRITICAL_REASON_KEYS: Record<string, MessageKey> = {
  'the home folder or one of its parents': 'critical.home',
  'a folder of the current window or one of its parents': 'critical.window',
  'the repository metadata (.git)': 'critical.git',
  'a system location': 'critical.system',
};

function criticalReasonForUser(why: string | undefined): string {
  const key = why === undefined ? undefined : CRITICAL_REASON_KEYS[why];

  return key ? t(key) : (why ?? '');
}

// Tool permission and filesystem-resource permission are separate.
//
// The folders explicitly opened in the current VS Code window are the implicit
// filesystem perimeter. A Cargo/pnpm/Node workspace detected around them is only
// structural information: it never grants access by itself.
//
// A user may explicitly grant one tool access to an exact resource, a directory
// or a detected structural workspace for the current session or all sessions.
//
// Protected and critical resources never inherit remembered resource grants.
export class ToolAccessGuard {
  private readonly refusedEffects =
    new Map<string, string>();

  constructor(
    private readonly store:
      PermissionStore,
    private readonly getMode:
      () => AutonomyMode,
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
    await this.assertPath(
      tool,
      'read',
      resolved,
      isDirectory,
      options,
    );
  }

  async assertPath(
    tool: ToolAccessProfile,
    capability:
      PermissionCapability,
    resolved: ResolvedPath,
    isDirectory = false,
    options: GuardOptions = {},
  ): Promise<void> {
    const fsPath =
      resourcePath(resolved.uri);

    await this.authorize(
      {
        tool,
        action:
          `${ACTION_LABELS[capability]} ` +
          `${isDirectory ? 'folder' : 'file'} ` +
          sanitizeForPrompt(fsPath),

        actionLabel:
          t(
            `action.${capability}.${isDirectory ? 'folder' : 'file'}`,
            { path: sanitizeForPrompt(fsPath) },
          ),

        resources: [
          this.permissionResource(
            resolved,
            isDirectory,
          ),
        ],

        detail: options.detail,
        effects: options.effects,

        access: this.accessFor(
          capability,
          [resolved],
          options.access,
        ),
      },
      options.signal,
    );
  }

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

        action:
          `move ${isDirectory ? 'folder' : 'file'} ` +
          sanitizeForPrompt(
            resourcePath(source.uri),
          ),

        actionLabel:
          t(
            `action.move.${isDirectory ? 'folder' : 'file'}`,
            { path: sanitizeForPrompt(resourcePath(source.uri)) },
          ),

        resources: [
          this.permissionResource(
            source,
            isDirectory,
          ),
          this.permissionResource(
            destination,
            isDirectory,
          ),
        ],

        detail: [
          t('detail.destination', {
            path:
              sanitizeForPrompt(
                resourcePath(destination.uri),
              ),
          }),
          options.detail,
        ]
          .filter(Boolean)
          .join('\n'),

        effects: options.effects,

        access: this.accessFor(
          'move',
          [source, destination],
          options.access,
        ),
      },
      options.signal,
    );
  }

  private permissionResource(
    resolved: ResolvedPath,
    isDirectory: boolean,
  ): PermissionRequest['resources'][number] {
    const fsPath =
      resourcePath(resolved.uri);

    if (
      resolved.insideCurrentWindow
    ) {
      return {
        path: fsPath,
        isDirectory,

        boundary: {
          kind: 'currentWindow',

          root:
            resolved.currentWindowRoot
              ? resourcePath(resolved.currentWindowRoot)
              : fsPath,
        },
      };
    }

    if (
      resolved.structuralWorkspace
    ) {
      return {
        path: fsPath,
        isDirectory,

        boundary: {
          kind:
            'structuralWorkspace',

          workspace:
            resolved.structuralWorkspace,
        },
      };
    }

    return {
      path: fsPath,
      isDirectory,
      boundary: {
        kind: 'external',
      },
    };
  }

  private accessFor(
    capability:
      PermissionCapability,
    paths: ResolvedPath[],
    announced?: AccessRequest,
  ): NonNullable<
    PermissionRequest['access']
  > {
    const whyCritical =
      capability === 'read' ||
      capability === 'search'
        ? undefined
        : paths
            .map(
              describeCriticalPath,
            )
            .find(
              (why) =>
                why !== undefined,
            );

    if (
      whyCritical !== undefined
    ) {
      return {
        required: 'critical',
        announced,
        whyCritical,
      };
    }

    return {
      required:
        paths.every(
          (candidate) =>
            candidate
              .insideCurrentWindow,
        )
          ? 'normal'
          : 'elevated',

      announced,
    };
  }

  unavailableReason(
    tool: ToolAccessProfile,
  ): string | undefined {
    if (
      tool.requiresTrust &&
      !vscode.workspace.isTrusted
    ) {
      return (
        'the workspace is not trusted'
      );
    }

    if (
      this.getMode() ===
        'readOnly' &&
      !tool.readOnlyCompatible
    ) {
      return (
        'the autonomy mode is read-only'
      );
    }

    return (
      this.store.resolve(
        tool.permissionKey ??
          tool.id,
      )?.policy === 'deny'
        ? 'denied by the user in the permission settings'
        : undefined
    );
  }

  isProtected(
    fsPath: string,
  ): boolean {
    return (
      isProtectedResource(
        fsPath,
      ) !== undefined
    );
  }

  async authorize(
    request: PermissionRequest,
    signal?: AbortSignal,
  ): Promise<void> {
    const tool =
      request.tool;

    const key =
      tool.permissionKey ??
      tool.id;

    const mode =
      this.getMode();

    const firstResource =
      request.resources[0]?.path;

    if (
      tool.requiresTrust &&
      !vscode.workspace.isTrusted
    ) {
      throw new PermissionError(
        'policy',
        'workspace_untrusted',
        `The workspace is not trusted, so ${tool.name} cannot be used. Nothing was executed.`,
        firstResource,
      );
    }

    const decision =
      this.store.resolve(key);

    if (
      decision?.policy === 'deny'
    ) {
      throw new PermissionError(
        'policy',
        'denied_by_policy',
        `${tool.name} is denied in the permission settings (${LIFETIME_FOR_MODEL[decision.lifetime]}). Nothing was executed. Do not try to reach the same effect another way; tell the user it is not allowed.`,
        firstResource,
        {
          lifetime:
            decision.lifetime,
        },
      );
    }

    if (
      mode === 'readOnly' &&
      !tool.readOnlyCompatible
    ) {
      throw new PermissionError(
        'policy',
        'read_only_mode',
        `Autonomy mode is read-only: ${tool.name} cannot ${request.action}. Nothing was executed.`,
        firstResource,
      );
    }

    this.assertNotRefusedEarlier(
      request,
    );

    const critical =
      request.access?.required ===
      'critical';

    if (critical) {
      this.assertCriticalJustified(
        request,
      );

      await this.ask(
        request,
        t('dialog.reason.critical'),
        [
          buttons.allowOnce,
          buttons.deny,
        ],
        signal,
      );

      return;
    }

    const protection =
      request.resources
        .map(
          (resource) =>
            isProtectedResource(
              resource.path,
            ),
        )
        .find(
          (pattern) =>
            pattern !== undefined,
        );

    if (
      protection !== undefined
    ) {
      await this.ask(
        request,
        t('dialog.reason.protected', { pattern: protection }),
        [
          buttons.allowOnce,
          buttons.deny,
        ],
        signal,
      );

      return;
    }

    const outside =
      request.resources.filter(
        (resource) =>
          resource.boundary.kind !==
          'currentWindow',
      );

    const explicitAsk =
      decision?.policy === 'ask';

    if (
      outside.length > 0
    ) {
      const ungranted =
        outside.filter(
          (resource) =>
            this.store
              .isResourceAllowed(
                key,
                resource.path,
              ) === undefined,
        );

      if (
        ungranted.length > 0
      ) {
        await this.askResourceAccess(
          request,
          key,
          ungranted,
          signal,
        );

        return;
      }

      // A remembered resource grant is already a specific authorization for
      // this tool + resource. Only an explicit "ask every time" overrides it.
      if (!explicitAsk) {
        return;
      }
    }

    const policy =
      decision?.policy ??
      tool.permissionDefault;

    if (policy === 'allow') {
      return;
    }

    if (
      mode === 'auto' &&
      !explicitAsk
    ) {
      return;
    }

    if (
      mode === 'acceptEdits' &&
      tool.editsFiles &&
      !explicitAsk
    ) {
      return;
    }

    const answer =
      await this.ask(
        request,
        explicitAsk
          ? t('dialog.reason.askEvery', { tool: tool.name })
          : undefined,
        [
          buttons.allowOnce,
          buttons.allowToolCurrentSession,
          buttons.allowToolAllSessions,
          buttons.deny,
        ],
        signal,
      );

    if (
      answer.choice ===
      buttons.allowToolCurrentSession
    ) {
      await this.store.set(
        key,
        'allow',
        'currentSession',
      );
    }

    if (
      answer.choice ===
      buttons.allowToolAllSessions
    ) {
      await this.store.set(
        key,
        'allow',
        'allSessions',
      );
    }
  }

  private async askResourceAccess(
    request: PermissionRequest,
    toolId: string,
    resources:
      PermissionRequest['resources'],
    signal?: AbortSignal,
  ): Promise<void> {
    const structural =
      commonStructuralWorkspace(
        resources,
      );

    const reason =
      structural
        ? t('dialog.reason.structural', {
            kind: structural.kind,
            root: resourcePath(structural.root),
          })
        : t('dialog.reason.outside');

    const choices = [
      buttons.allowOnce,
      buttons.allowResourcesCurrentSession,
      buttons.allowResourcesAllSessions,
      ...(
        structural
          ? [
              buttons.allowWorkspaceCurrentSession,
              buttons.allowWorkspaceAllSessions,
            ]
          : []
      ),
      buttons.deny,
    ];

    const answer =
      await this.ask(
        request,
        reason,
        choices,
        signal,
      );

    if (
      answer.choice ===
        buttons.allowResourcesCurrentSession ||
      answer.choice ===
        buttons.allowResourcesAllSessions
    ) {
      const lifetime =
        answer.choice ===
          buttons.allowResourcesCurrentSession
          ? 'currentSession'
          : 'allSessions';

      for (
        const resource
        of resources
      ) {
        await this.store
          .allowResource(
            toolId,
            resource.path,
            resource.isDirectory
              ? 'directory'
              : 'exact',
            lifetime,
          );
      }

      return;
    }

    if (
      structural &&
      (
        answer.choice ===
          buttons.allowWorkspaceCurrentSession ||
        answer.choice ===
          buttons.allowWorkspaceAllSessions
      )
    ) {
      await this.store
        .allowResource(
          toolId,
          resourcePath(structural.root),
          'structuralWorkspace',
          answer.choice ===
            buttons.allowWorkspaceCurrentSession
            ? 'currentSession'
            : 'allSessions',
        );
    }
  }

  private assertCriticalJustified(
    request: PermissionRequest,
  ): void {
    const announced =
      request.access?.announced;

    const reason =
      announced?.kind ===
        'critical'
        ? announced.reason.trim()
        : '';

    if (reason) {
      return;
    }

    throw new PermissionError(
      'policy',
      'critical_justification_required',
      `This operation touches a critical location (${request.access?.whyCritical ?? 'critical'}): ${request.action}. Nothing was executed. If you really need it, call the tool again with access {"kind":"critical","reason":"<why you must touch this location>"}; the user will then be asked to confirm.`,
      request.resources[0]?.path,
      {
        requiredAccess:
          'critical',

        whyCritical:
          request.access
            ?.whyCritical,

        correctableByTheModel:
          true,
      },
    );
  }

  private effectsOf(
    request: PermissionRequest,
  ): string[] {
    if (request.effects) {
      return request.effects;
    }

    const key =
      request.tool.permissionKey ??
      request.tool.id;

    if (
      request.resources.length === 0
    ) {
      return [
        `tool:${key}`,
      ];
    }

    return request.resources.map(
      (resource) =>
        `tool:${key}:${resource.path}`,
    );
  }

  private assertNotRefusedEarlier(
    request: PermissionRequest,
  ): void {
    const earlier =
      this.effectsOf(
        request,
      ).find(
        (effect) =>
          this.refusedEffects.has(
            effect,
          ),
      );

    if (
      earlier === undefined
    ) {
      return;
    }

    throw new PermissionError(
      'user_refused',
      'user_refused',
      `The user already explicitly refused this effect earlier in this turn (${this.refusedEffects.get(earlier)}). Nothing was executed. Do not retry it or reach the same effect another way; ask the user instead.`,
      request.resources[0]?.path,
      {
        enforcedFromEarlierRefusal:
          true,
      },
    );
  }

  private async ask(
    request: PermissionRequest,
    reason: string | undefined,
    choices: string[],
    signal?: AbortSignal,
  ): Promise<{
    choice: string;
    feedback?: string;
  }> {
    if (signal?.aborted) {
      throw cancelledWhileWaiting(
        request,
      );
    }

    const critical =
      request.access?.required ===
      'critical';

    const announced =
      request.access?.announced;

    const shownAction =
      request.actionLabel ??
      request.action;

    const detail = [
      critical
        ? t('dialog.critical')
        : undefined,

      t('dialog.tool', {
        tool: `${request.tool.name} (${request.tool.permissionKey ?? request.tool.id})`,
      }),

      critical
        ? t('dialog.action', { action: shownAction })
        : undefined,

      critical &&
      request.resources.length > 0
        ? t('dialog.target', {
            target:
              request.resources
                .map(
                  (resource) =>
                    sanitizeForPrompt(
                      resource.path,
                    ),
                )
                .join(' -> '),
          })
        : undefined,

      critical
        ? t('dialog.whyCritical', {
            reason:
              criticalReasonForUser(
                request.access?.whyCritical,
              ),
          })
        : undefined,

      critical &&
      announced?.kind ===
        'critical'
        ? t('dialog.aiReason', {
            reason: sanitizeForPrompt(announced.reason, 500),
          })
        : undefined,

      request.detail
        ? formatDetail(
            request.detail,
          )
        : undefined,

      reason,

      critical
        ? t('dialog.criticalWarning')
        : undefined,

      request.warning,

      t('dialog.closeNotRefusal'),
    ]
      .filter(Boolean)
      .join('\n');

    const dialog =
      Promise.resolve(
        vscode.window
          .showWarningMessage(
            t('dialog.title', { action: shownAction }),
            {
              modal: true,
              detail,
            },
            ...choices,
          ),
      ).then(
        async (choice) => {
          if (
            choice === buttons.deny
          ) {
            const feedback =
              await vscode.window
                .showInputBox({
                  title:
                    t('dialog.refusedTitle'),

                  prompt:
                    t('dialog.refusedPrompt'),
                });

            return {
              choice,
              feedback:
                feedback?.trim() ||
                undefined,
            };
          }

          return choice === undefined
            ? undefined
            : { choice };
        },
      );

    let answer:
      | {
          choice: string;
          feedback?: string;
        }
      | undefined;

    if (!signal) {
      answer = await dialog;
    } else {
      let onAbort:
        (() => void) |
        undefined;

      const cancelled =
        new Promise<never>(
          (_, reject) => {
            onAbort = () =>
              reject(
                cancelledWhileWaiting(
                  request,
                ),
              );

            signal.addEventListener(
              'abort',
              onAbort,
              { once: true },
            );
          },
        );

      try {
        answer =
          await Promise.race([
            dialog,
            cancelled,
          ]);
      } finally {
        if (onAbort) {
          signal.removeEventListener(
            'abort',
            onAbort,
          );
        }
      }
    }

    if (!answer) {
      throw new PermissionError(
        'no_decision',
        'permission_not_decided',
        `The permission dialog was closed without a decision to ${request.action}. This is not a refusal. Nothing was executed.`,
        request.resources[0]?.path,
      );
    }

    if (
      answer.choice === buttons.deny
    ) {
      for (
        const effect
        of this.effectsOf(request)
      ) {
        this.refusedEffects.set(
          effect,
          request.action,
        );
      }

      const feedback =
        answer.feedback
          ? ` The user added: "${sanitizeForPrompt(answer.feedback, 500)}".`
          : '';

      throw new PermissionError(
        'user_refused',
        'user_refused',
        `The user explicitly refused permission to ${request.action}. Nothing was executed.${feedback} Do not retry it or reach the same effect another way; ask the user instead.`,
        request.resources[0]?.path,
      );
    }

    return answer;
  }
}

function commonStructuralWorkspace(
  resources:
    PermissionRequest['resources'],
): StructuralWorkspace | undefined {
  if (
    resources.length === 0
  ) {
    return undefined;
  }

  const workspaces =
    resources.map(
      (resource) =>
        resource.boundary.kind ===
          'structuralWorkspace'
          ? resource.boundary
              .workspace
          : undefined,
    );

  if (
    workspaces.some(
      (workspace) =>
        workspace === undefined,
    )
  ) {
    return undefined;
  }

  const first =
    workspaces[0];

  if (!first) {
    return undefined;
  }

  return workspaces.every(
    (workspace) =>
      workspace?.root.toString() ===
        first.root.toString() &&
      workspace.kind ===
        first.kind,
  )
    ? first
    : undefined;
}

function formatDetail(
  detail: string,
): string {
  const lines =
    detail.split('\n');

  const shown =
    lines
      .slice(
        0,
        MAX_DETAIL_LINES,
      )
      .map(
        (line) =>
          sanitizeForPrompt(
            line,
            MAX_DETAIL_LINE_CHARS,
          ),
      );

  return [
    ...shown,

    ...(
      lines.length >
      MAX_DETAIL_LINES
        ? [
            t('dialog.moreLines', {
              count:
                lines.length -
                MAX_DETAIL_LINES,
            }),
          ]
        : []
    ),
  ].join('\n');
}

function cancelledWhileWaiting(
  request: PermissionRequest,
): PermissionError {
  return new PermissionError(
    'no_decision',
    'cancelled_while_waiting',
    `The request was cancelled before the user decided whether to ${request.action}. This is not a refusal. Nothing was executed.`,
    request.resources[0]?.path,
  );
}
