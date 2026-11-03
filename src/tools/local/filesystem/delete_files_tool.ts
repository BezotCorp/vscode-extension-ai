import { BatchFileTool } from './batch_file_tool';
import { DeleteFileTool } from './delete_file_tool';

export class DeleteFilesTool extends BatchFileTool {
  constructor(single: DeleteFileTool) {
    super(single, 'delete_files', 'Delete Files', 'Moves several files or folders to the trash in one call, each as delete_file does. Use delete_file for a single one.');
  }
}
