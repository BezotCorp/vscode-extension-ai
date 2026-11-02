import * as vscode from 'vscode';

import { ChatManager } from '../chat/chat_manager';
import { applyPatchCandidate } from '../patch/patch_applier';
import { detectPatchPreviews } from '../patch/patch_detector';
import { PatchApplyResult } from '../patch/patch_apply_result';
import { PatchPreview } from '../patch/patch_preview';

// Patches being applied right now: a second click must not apply the same patch twice.
const applying = new Set<string>();

export function detectAndSendPatchPreviews(
  webviewView: vscode.WebviewView,
  patchPreviewsStore: Map<string, PatchPreview>,
  assistantText: string,
): void {
  const patchPreviews = detectPatchPreviews(assistantText);

  if (patchPreviews.length === 0) {
    return;
  }

  for (const preview of patchPreviews) {
    patchPreviewsStore.set(preview.candidate.id, preview);
  }

  webviewView.webview.postMessage({
    type: 'patchPreviews',
    previews: patchPreviews,
  });
}

// Shows the patches proposed in the last response of the active conversation, with the decisions already taken.
export function restorePatchPreviews(
  webviewView: vscode.WebviewView,
  patchPreviewsStore: Map<string, PatchPreview>,
  chatManager: ChatManager,
): void {
  patchPreviewsStore.clear();

  const last = chatManager.getMessages().at(-1);
  const previews =
    last?.role === 'assistant'
      ? detectPatchPreviews(last.content).map((preview) => ({
          ...preview,
          status: last.patchStatuses?.[preview.candidate.id] ?? preview.status,
        }))
      : [];

  for (const preview of previews) {
    patchPreviewsStore.set(preview.candidate.id, preview);
  }

  webviewView.webview.postMessage({ type: 'patchPreviews', previews });
}

async function rememberDecision(chatManager: ChatManager, patchId: string, status: 'accepted' | 'rejected') {
  try {
    await chatManager.setPatchStatus(patchId, status);
  } catch (error) {
    void vscode.window.showWarningMessage(`BezotCorp AI: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function acceptPatch(
  webviewView: vscode.WebviewView,
  patchPreviewsStore: Map<string, PatchPreview>,
  chatManager: ChatManager,
  patchId: string | undefined,
): Promise<void> {
  if (!patchId) {
    return;
  }

  const preview = patchPreviewsStore.get(patchId);

  if (!preview || preview.status !== 'pending' || applying.has(patchId)) {
    return;
  }

  applying.add(patchId);

  let result: PatchApplyResult;

  try {
    result = await applyPatchCandidate(preview.candidate);
  } finally {
    applying.delete(patchId);
  }

  if (!result.success) {
    webviewView.webview.postMessage({
      type: 'patchStatus',
      patchId,
      status: 'pending',
      error: result.error ?? 'Failed to apply patch.',
    });
    return;
  }

  preview.status = 'accepted';
  patchPreviewsStore.set(patchId, preview);
  await rememberDecision(chatManager, patchId, 'accepted');

  webviewView.webview.postMessage({
    type: 'patchStatus',
    patchId,
    status: 'accepted',
  });
}

export async function rejectPatch(
  webviewView: vscode.WebviewView,
  patchPreviewsStore: Map<string, PatchPreview>,
  chatManager: ChatManager,
  patchId: string | undefined,
): Promise<void> {
  if (!patchId) {
    return;
  }

  const preview = patchPreviewsStore.get(patchId);

  if (!preview || preview.status !== 'pending') {
    return;
  }

  preview.status = 'rejected';
  patchPreviewsStore.set(patchId, preview);
  await rememberDecision(chatManager, patchId, 'rejected');

  webviewView.webview.postMessage({
    type: 'patchStatus',
    patchId,
    status: 'rejected',
  });
}
