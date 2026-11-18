import type { ToolRound } from '../tools/tool_round';
import { MAX_REPLAYED_RESULT_CHARACTERS } from './chat_history_limits';

// A stored round as an earlier turn of a new request: the results are cut to what a request may hold, and the file
// observations stay out, because they describe the past and are not part of what the model receives.
export function replayToolRound(round: ToolRound): ToolRound {
  return {
    content: round.content,
    calls: round.calls.map((call) => ({
      name: call.name,
      arguments: call.arguments,
      result:
        call.result.length > MAX_REPLAYED_RESULT_CHARACTERS
          ? `${call.result.slice(0, MAX_REPLAYED_RESULT_CHARACTERS)}\n/* result cut in history */`
          : call.result,
    })),
  };
}
