import { ToolAccessProfile } from '../permissions';
import { ToolExecutionContext, ToolExecutionResult, ToolParametersSchema } from '.';

export interface Tool extends ToolAccessProfile {
  description: string;
  parameters: ToolParametersSchema;
  execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult>;
}
