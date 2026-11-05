import { BatchFileTool } from "./batch_file_tool";
import type { CreateFileTool } from "./create_file_tool";

export class CreateFilesTool extends BatchFileTool {
	constructor(single: CreateFileTool) {
		super(
			single,
			"create_files",
			"Create Files",
			"Creates several new files in one call, each as create_file does. A file that already exists fails on its own without stopping the others. Use create_file for a single file.",
		);
	}
}
