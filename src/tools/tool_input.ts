import { sanitizeForPrompt } from '../permissions';

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

  return `${content.length} characters, ${lines} lines. Starts with: ${sanitizeForPrompt(content.slice(0, 160))}`;
}
