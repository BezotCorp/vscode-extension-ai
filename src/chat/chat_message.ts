import { ToolRound } from '../tools/tool_round';
import type { ChatRole } from './chat_role';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  createdAt: string;
  toolRounds?: ToolRound[];
};

export function createChatMessage(role: ChatRole, content: string, toolRounds?: ToolRound[]): ChatMessage {
  return {
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(toolRounds && toolRounds.length > 0 && { toolRounds }),
  };
}

export function cloneChatMessage(message: ChatMessage): ChatMessage {
  return { ...message };
}
