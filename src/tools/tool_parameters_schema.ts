import type { ToolParameterSchema } from './tool_parameter_schema';

export type ToolParametersSchema = {
  type: 'object';
  properties: Record<string, ToolParameterSchema>;
  required?: string[];
};
