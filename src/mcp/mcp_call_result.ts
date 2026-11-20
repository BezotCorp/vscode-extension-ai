export type McpCallResult = {
  text: string;
  isError: boolean;
  partTypes: string[];
  structuredContent?: unknown;
};
