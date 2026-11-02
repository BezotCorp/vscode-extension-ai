import * as vscode from 'vscode';
import { findUniqueMatch, PatchApplyResult, PatchCandidate } from '.';
import { resolvePath } from '../workspace';

export async function applyPatchCandidate(candidate: PatchCandidate): Promise<PatchApplyResult> {
  try {
    const uri = resolvePath(candidate.path).uri;

    const document = await vscode.workspace.openTextDocument(uri);
    const match = findUniqueMatch(document.getText(), candidate.oldText, candidate.newText);

    if (match.kind === 'missing') {
      return {
        success: false,
        error: `Old text not found in ${candidate.path}`,
      };
    }

    if (match.kind === 'ambiguous') {
      return {
        success: false,
        error: `Old text appears ${match.count} times in ${candidate.path}; the patch needs more surrounding lines.`,
      };
    }

    const edit = new vscode.WorkspaceEdit();

    edit.replace(
      uri,
      new vscode.Range(document.positionAt(match.offset), document.positionAt(match.offset + match.oldText.length)),
      match.newText,
    );

    if (!(await vscode.workspace.applyEdit(edit))) {
      return {
        success: false,
        error: `VS Code refused to apply patch for ${candidate.path}`,
      };
    }

    if (!(await document.save())) {
      return {
        success: false,
        error: `Patch applied in the editor, but ${candidate.path} could not be saved.`,
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: `Could not apply the patch to ${candidate.path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
