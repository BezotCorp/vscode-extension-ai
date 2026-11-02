import * as http from 'node:http';
import * as vscode from 'vscode';

import { isProtectedResource } from '../permissions';

export function handleActiveFile(res: http.ServerResponse): void {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'no active file' }));
    return;
  }

  if (isProtectedResource(editor.document.uri.fsPath)) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'this file is a protected resource' }));
    return;
  }

  res.writeHead(200);
  res.end(
    JSON.stringify({
      path: editor.document.uri.fsPath,
      content: editor.document.getText(),
    }),
  );
}
