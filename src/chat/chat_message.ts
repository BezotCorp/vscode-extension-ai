import type { ToolRound } from '../tools/tool_round';
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

// A stored assistant message holds the text of every round in order, followed by the closing answer.
// The tool rounds already carry the earlier text, so this returns only the closing answer.
export function closingText(message: ChatMessage): string {
  const earlier = (message.toolRounds ?? []).map((round) => round.content).join('');

  return earlier && message.content.startsWith(earlier) ? message.content.slice(earlier.length) : message.content;
}
