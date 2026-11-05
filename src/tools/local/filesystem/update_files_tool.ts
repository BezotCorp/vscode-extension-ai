import { BatchFileTool } from './batch_file_tool';
import type { UpdateFileTool } from './update_file_tool';

export class UpdateFilesTool extends BatchFileTool {
	constructor(single: UpdateFileTool) {
		super(
			single,
			'update_files',
			'Update Files',
			'Changes several existing files in one call, each as update_file does (old_text/new_text or content per file). Each file is checked and written on its own; one failing does not stop the others, and nothing is rolled back across files. Use update_file for a single file.',
		);
	}
}
