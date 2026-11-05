import type { ToolRound } from '../tools';

export type ChatHistoryMessage = {
	role: 'user' | 'assistant';
	content: string;
	// Tool calls made before this answer, so the model keeps what it read and did in earlier turns.
	toolRounds?: ToolRound[];
};
