import { t } from '../i18n';
import { type AccessRequest, sanitizeForPrompt } from '../permissions';

export function readStringArg(input: unknown, key: string): string | undefined {
  const value = (input as Record<string, unknown> | null | undefined)?.[key];

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readNumberArg(input: unknown, key: string): number | undefined {
  const value = (input as Record<string, unknown> | null | undefined)?.[key];
  const parsed = typeof value === 'string' ? Number(value) : value;

  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

export function readStringArrayArg(input: unknown, key: string): string[] | undefined {
  const value = (input as Record<string, unknown> | null | undefined)?.[key];

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return typeof value === 'string' && value.trim() ? value.trim().split(/\s+/) : undefined;
}

export function describeContent(content: string): string {
  const lines = content.split('\n').length;

  return t('detail.content', {
    chars: content.length,
    lines,
    start: sanitizeForPrompt(content.slice(0, 160)),
  });
}

// The level of access the model announces in a call: an object {kind, reason} or just the kind. Anything that is not
// understood counts as `normal`: the runtime works out the level the operation really needs, so a wrong or missing
// announcement is never a reason to refuse. The reason of a critical request is kept only when it says something.
export function readAccessArg(input: unknown): AccessRequest {
  const value = (input as Record<string, unknown> | null | undefined)?.access;
  const kind = typeof value === 'string' ? value : (value as { kind?: unknown } | null | undefined)?.kind;

  if (kind === 'elevated') {
    return { kind: 'elevated' };
  }

  if (kind === 'critical') {
    const reason = (value as { reason?: unknown } | null)?.reason;

    return {
      kind: 'critical',
      reason: typeof reason === 'string' ? reason.trim() : '',
    };
  }

  return { kind: 'normal' };
}
