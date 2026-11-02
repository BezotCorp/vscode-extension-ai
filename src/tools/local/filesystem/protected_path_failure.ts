import { ToolExecutionResult } from '../..';
import { toolFailure } from '../../tool_result';

export function protectedPathFailure(operation: string, resource: string, what: string): ToolExecutionResult {
  return toolFailure('denied', operation, resource, {
    reason: 'protected_path',
    message: `This path is ${what}. Tools never delete or move it, in any autonomy mode. Nothing was executed.`,
    executed: false,
    retryable: false,
    details: { decidedBy: 'policy' },
  });
}
