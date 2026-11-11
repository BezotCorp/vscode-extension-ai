import type { AiContext, ContextFilter } from '../context';
import type { ToolRegistry } from '../tools';
import type { ChatHistoryMessage } from './chat_history_message';

export type ChatRequest = {
  message: string;
  // Earlier turns of the active conversation, oldest first, without the current message.
  history?: ChatHistoryMessage[];
  context: AiContext;
  contextFilter?: ContextFilter;
  tools?: ToolRegistry;
};
