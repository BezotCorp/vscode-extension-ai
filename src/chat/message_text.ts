import type { ChatMessage } from "./chat_message";

// A stored assistant message holds the text of every round in order, followed by the closing answer.
// The tool rounds already carry the earlier text, so this returns only the closing answer.
export function closingText(message: ChatMessage): string {
	const earlier = (message.toolRounds ?? [])
		.map((round) => round.content)
		.join("");

	return earlier && message.content.startsWith(earlier)
		? message.content.slice(earlier.length)
		: message.content;
}
