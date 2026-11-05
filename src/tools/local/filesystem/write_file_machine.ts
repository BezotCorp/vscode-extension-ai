import type { StateMachineDefinition } from '../../../state_machine';
import type { WriteFileState } from './write_file_state';

export const WRITE_FILE_MACHINE: StateMachineDefinition<WriteFileState> = {
	initial: 'ready_to_copy',
	transitions: {
		ready_to_copy: ['copy_pending'],
		copy_pending: ['copy_done', 'copy_conflict', 'copy_failed'],
		copy_done: ['pending_update'],
		copy_conflict: [],
		copy_failed: [],
		pending_update: ['update_done', 'update_conflict', 'update_failed', 'write_pending'],
		update_conflict: [],
		update_failed: [],
		write_pending: ['update_done', 'update_conflict', 'update_failed', 'restore_file'],
		update_done: ['check_integrity'],
		check_integrity: ['integrity_true', 'integrity_false'],
		integrity_true: [],
		integrity_false: ['restore_file'],
		restore_file: ['restore_done', 'restore_failed'],
		restore_done: [],
		restore_failed: [],
	},
};
