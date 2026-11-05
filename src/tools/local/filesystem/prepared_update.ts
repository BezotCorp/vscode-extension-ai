import type { FileRead } from './file_read';
import type { ReceivedPart } from './received_part';
import type { UpdateProjection } from './update_projection';

export type PreparedUpdate = {
	read: FileRead;
	projection: Extract<UpdateProjection, { ok: true }>;
	contextWasCurrent: boolean;
	// Local change on a file that changed: the part the model received that is still unchanged around the change.
	part?: ReceivedPart;
};
