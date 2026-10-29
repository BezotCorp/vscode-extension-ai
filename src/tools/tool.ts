import { ToolExecutionContext, ToolExecutionResult, ToolParametersSchema } from '.';

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  // True only when the tool can never change anything: it stays available in read-only mode.
  readOnlyCompatible: boolean;
  execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult>;
}
