import { BatchFileTool } from './batch_file_tool';
import { ReadFileTool } from './read_file_tool';

export class ReadFilesTool extends BatchFileTool {
  constructor(single: ReadFileTool) {
    super(
      single,
      'read_files',
      'Read Files',
      'Reads several text files in one call, each as read_file does (optional line range per file). Use read_file for a single file.',
    );
  }
}
