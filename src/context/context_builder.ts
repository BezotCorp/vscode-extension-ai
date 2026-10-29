import * as vscode from 'vscode';

import { ContextMode } from '../config/extension_config';
import { truncateContent, WORKSPACE_EXCLUDE_GLOB } from '../workspace';
import { ChatContext, ContextFile, ContextSelection } from '.';

const MAX_OPEN_FILES = 8;
const MAX_WORKSPACE_FILES = 200;

type ContextBuildOptions = {
  includeActiveFile: boolean;
  includeOpenFiles: boolean;
  includeSelectedText: boolean;
  includeWorkspaceTree: boolean;
};

export async function buildChatContext(mode: ContextMode, options: ContextBuildOptions): Promise<ChatContext> {
  const activeFile = options.includeActiveFile ? getActiveFile() : undefined;
  const selectedText = options.includeSelectedText ? getSelectedText() : undefined;
  const shouldIncludeOpenFiles = options.includeOpenFiles || mode === 'rich';
  const shouldIncludeWorkspaceTree = options.includeWorkspaceTree || mode === 'rich';

  return {
    mode,
    selectedText,
    activeFile,
    openFiles: shouldIncludeOpenFiles ? getOpenFiles(activeFile?.path) : [],
    workspaceFiles: shouldIncludeWorkspaceTree ? await getWorkspaceFiles() : [],
  };
}

function getActiveFile(): ContextFile | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.isUntitled || editor.document.uri.scheme !== 'file') {
    return undefined;
  }

  return documentToContextFile(editor.document);
}

export function getSelectedText(): ContextSelection | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.isUntitled || editor.document.uri.scheme !== 'file') {
    return undefined;
  }

  if (editor.selection.isEmpty) {
    return undefined;
  }

  const text = editor.document.getText(editor.selection).trim();

  if (!text) {
    return undefined;
  }

  return {
    path: editor.document.uri.fsPath,
    languageId: editor.document.languageId,
    text: truncateContent(text),
  };
}

function getOpenFiles(activeFilePath?: string): ContextFile[] {
  return vscode.workspace.textDocuments
    .filter((document) => !document.isUntitled && document.uri.scheme === 'file')
    .filter((document) => document.uri.fsPath !== activeFilePath)
    .slice(0, MAX_OPEN_FILES)
    .map(documentToContextFile);
}

export async function getWorkspaceFiles(): Promise<string[]> {
  const files = await vscode.workspace.findFiles('**/*', WORKSPACE_EXCLUDE_GLOB, MAX_WORKSPACE_FILES);

  return files.map((file) => vscode.workspace.asRelativePath(file, false)).sort();
}

function documentToContextFile(document: vscode.TextDocument): ContextFile {
  const content = document.getText();

  return {
    path: document.uri.fsPath,
    languageId: document.languageId,
    content: truncateContent(content),
  };
}
