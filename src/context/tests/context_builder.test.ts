import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ editor: undefined as unknown }));

vi.mock('vscode', () => ({
  Uri: { parse: () => undefined },
  window: {
    get activeTextEditor() {
      return host.editor;
    },
  },
  workspace: {
    get workspaceFolders() {
      return undefined;
    },
    getConfiguration: () => ({ inspect: () => ({ globalValue: [] }) }),
  },
}));

import { buildAiContext } from '../context_builder';
import { estimatedCharacterBudget, estimatedCharactersForTokens } from '../token_estimation';

const editor = (fsPath: string, text: string, extra: object = {}, scheme = 'file') => ({
  document: { uri: { scheme, fsPath }, languageId: 'typescript', isUntitled: false, getText: () => text, ...extra },
});

describe('buildAiContext', () => {
  beforeEach(() => {
    host.editor = undefined;
  });

  it('has no active file when no editor is open', async () => {
    expect(await buildAiContext()).toEqual({ editor: { activeFile: undefined } });
  });

  it('describes the active file with its path, its language and its content', async () => {
    host.editor = editor('/w/a.ts', 'const a = 1;');

    expect((await buildAiContext()).editor.activeFile).toEqual({
      path: '/w/a.ts',
      languageId: 'typescript',
      content: 'const a = 1;',
    });
  });

  it('cuts a file that is too long, and says so', async () => {
    host.editor = editor('/w/a.ts', 'x'.repeat(50_000));

    const content = (await buildAiContext()).editor.activeFile?.content ?? '';

    expect(content.length).toBeLessThan(50_000);
    expect(content).toContain('Content truncated');
  });

  it('shows a protected file by its path only, with its content withheld', async () => {
    host.editor = editor('/w/.env', 'SECRET=1');

    const file = (await buildAiContext()).editor.activeFile;

    expect(file).toEqual({ path: '/w/.env', languageId: 'typescript', withheld: 'protected' });
    expect(file).not.toHaveProperty('content');
  });

  it('ignores an unsaved new file, and a file that is not on the local filesystem', async () => {
    host.editor = editor('/w/new', 'x', { isUntitled: true });
    expect((await buildAiContext()).editor.activeFile).toBeUndefined();

    host.editor = editor('/repo/a.ts', 'x', {}, 'vscode-vfs');
    expect((await buildAiContext()).editor.activeFile).toBeUndefined();
  });
});

describe('token estimation', () => {
  it('estimates three characters per token', () => {
    expect(estimatedCharactersForTokens(1_000)).toBe(3_000);
    expect(estimatedCharactersForTokens(0)).toBe(0);
  });

  it('takes a share of that, rounded down', () => {
    expect(estimatedCharacterBudget(1_000, 0.4)).toBe(1_200);
    expect(estimatedCharacterBudget(1_001, 0.25)).toBe(750);
  });
});
