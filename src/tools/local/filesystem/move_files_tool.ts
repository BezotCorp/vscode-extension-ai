import { BatchFileTool } from "./batch_file_tool";
import type { MoveFileTool } from "./move_file_tool";

export class MoveFilesTool extends BatchFileTool {
	constructor(single: MoveFileTool) {
		super(
			single,
			"move_files",
			"Move Files",
			"Moves or renames several files or folders in one call, each as move_file does. Use move_file for a single one.",
		);
	}
}
