import type { ToolCall, ToolExecutionResult, ToolRound } from '../tools';

export type ChatStreamHandler = {
  onStart(): void;
  onChunk(chunk: string): void;
  onToolCall?(call: ToolCall): void;
  onToolResult?(call: ToolCall, result: ToolExecutionResult): void;
  onToolRound?(round: ToolRound): void;
  onNotice?(text: string): void;
  onEnd(): void;
};
