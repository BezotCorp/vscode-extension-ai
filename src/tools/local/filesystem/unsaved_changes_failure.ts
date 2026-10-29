import { ToolExecutionResult } from '../..';
import { toolFailure } from '../../tool_result';

export function unsavedChangesFailure(operation: string, resource: string): ToolExecutionResult {
  return toolFailure('error', operation, resource, {
    reason: 'unsaved_changes',
    message:
      'The file has unsaved changes in the VS Code editor. It was not touched. Ask the user to save or discard them first, or propose the change as a patch.',
    executed: false,
    retryable: false,
    details: { source: 'editor_buffer' },
  });
}
