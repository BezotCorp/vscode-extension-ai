export type ToolParameterSchema = {
  type?: string;
  description?: string;
  [key: string]: unknown;
};

export type ToolParametersSchema = {
  type: 'object';
  properties: Record<string, ToolParameterSchema>;
  required?: string[];
};
