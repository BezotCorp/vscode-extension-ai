import * as http from 'node:http';

import { getExtensionConfig } from '../config/extension_config';
import { PermissionStore } from '../permissions';
import { ToolAccessGuard } from '../tools';
import { EditFileTool } from '../tools/local/filesystem';

const MAX_BODY_BYTES = 1_000_000;

type PatchPayload = {
  path?: unknown;
  old?: unknown;
  new?: unknown;
};

const STATUS_BY_REASON: Record<string, number> = {
  old_text_not_found: 404,
  not_found: 404,
  ambiguous_match: 409,
  changed_during_confirmation: 409,
  unsaved_changes: 409,
};

// A patch sent by another program is an edit like any other: it goes through the same tool, so permission rules,
// the autonomy mode and the confirmation dialog apply, and the old text must match exactly once.
export function handlePatch(req: http.IncomingMessage, res: http.ServerResponse, store: PermissionStore): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;

  req.on('data', (chunk: Buffer) => {
    size += chunk.length;

    if (size > MAX_BODY_BYTES) {
      tooLarge = true;
      return;
    }

    chunks.push(chunk);
  });

  req.on('end', async () => {
    try {
      if (tooLarge) {
        res.writeHead(413);
        res.end(JSON.stringify({ error: 'request body too large' }));
        return;
      }

      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as PatchPayload;

      if (typeof payload.path !== 'string' || typeof payload.old !== 'string' || typeof payload.new !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'path, old and new must be strings' }));
        return;
      }

      const guard = new ToolAccessGuard(store, () => getExtensionConfig().autonomyMode);
      const result = await new EditFileTool(guard).execute({ path: payload.path, old_text: payload.old, new_text: payload.new });

      if (result.status === 'success') {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, path: payload.path }));
        return;
      }

      const status =
        result.status === 'denied' ? 403 : result.status === 'cancelled' ? 409 : (STATUS_BY_REASON[result.reason ?? ''] ?? 400);

      res.writeHead(status);
      res.end(JSON.stringify({ error: result.message ?? result.reason ?? result.status, reason: result.reason }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
}
