import { ToolRound } from '../tools/tool_round';
import type { ChatRole } from './chat_role';

// Define the structure of a chat message
export type ChatMessage = {
  role: ChatRole; // The role of the message (either user or assistant)
  content: string; // The content of the message
  createdAt: string; // The timestamp when the message was created, formatted as ISO string
  toolRounds?: ToolRound[]; // Tool calls the assistant made before this answer, kept for later turns
};

// Function to create a new chat message with the current timestamp
export function createChatMessage(role: ChatRole, content: string, toolRounds?: ToolRound[]): ChatMessage {
  return {
    role,
    content,
    createdAt: new Date().toISOString(), // Get the current timestamp in ISO format
    ...(toolRounds && toolRounds.length > 0 && { toolRounds }),
  };
}

// Function to clone an existing chat message (shallow copy)
export function cloneChatMessage(message: ChatMessage): ChatMessage {
  return { ...message }; // Create a shallow copy of the message object
}
