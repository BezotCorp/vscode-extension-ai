import type { ToolCall, ToolExecutionResult, ToolRegistry, ToolRound } from '.';
import { MAX_CALLS_PER_ROUND } from './tool_loop_limits';
import { serializeToolResult, toolFailure } from './tool_result';

export type ToolLoopOptions<TMessage> = {
  messages: TMessage[];
  tools?: ToolRegistry;
  maxRounds: number;
  signal?: AbortSignal;
  runRound(messages: TMessage[], allowTools: boolean): Promise<{ content: string; toolCalls: ToolCall[] }>;
  assistantMessage(content: string, toolCalls: ToolCall[]): TMessage;
  toolMessage(call: ToolCall, content: string): TMessage;
  onToolCall?(call: ToolCall): void;
  onToolResult?(call: ToolCall, result: ToolExecutionResult): void;
  // Largest serialized tool result handed to the model, in characters.
  maxResultChars?: number;
  // Size of the conversation above which the model is made to answer with what it has instead of calling more tools.
  contextBudgetChars?: number;
  onContextFull?(): void;
  // Reported once per round, also when the round is cut short, with the calls that have a result.
  onRound?(round: ToolRound): void;
};

export async function runToolLoop<TMessage>(options: ToolLoopOptions<TMessage>): Promise<void> {
  const { messages, tools, maxRounds } = options;
  // Calls with side effects whose outcome is uncertain: not repeated until the state has been inspected.
  const uncertain = new Set<string>();

  for (let round = 0; round <= maxRounds; round++) {
    if (options.signal?.aborted) {
      throw new Error('Generation aborted');
    }

    const contextFull =
      options.contextBudgetChars !== undefined && JSON.stringify(messages).length > options.contextBudgetChars;

    if (contextFull && tools !== undefined && round < maxRounds && round > 0) {
      options.onContextFull?.();
    }

    const allowTools = tools !== undefined && round < maxRounds && !contextFull;
    const { content, toolCalls } = await options.runRound(messages, allowTools);

    if (!tools || toolCalls.length === 0 || !allowTools) {
      return;
    }

    // The protocol needs the assistant message with all its calls, then one tool message per call.
    messages.push(options.assistantMessage(content, toolCalls));

    const toolRound: ToolRound = { content, calls: [] };

    try {
      for (const [index, call] of toolCalls.entries()) {
        if (options.signal?.aborted) {
          break;
        }

        options.onToolCall?.(call);

        const key = `${call.name}:${JSON.stringify(call.arguments)}`;
        const result =
          index >= MAX_CALLS_PER_ROUND
            ? toolFailure('error', call.name, undefined, {
                reason: 'too_many_calls',
                message: `Only ${MAX_CALLS_PER_ROUND} tool calls are run per response. This one was not executed.`,
                executed: false,
                retryable: true,
              })
            : uncertain.has(key)
              ? toolFailure('unknown', call.name, undefined, {
                  reason: 'repeat_blocked',
                  message:
                    'An identical call ended with an uncertain outcome. Automatic repetition remains blocked for this generation, even after read-only calls. Ask the user before attempting the operation again in a new turn.',
                  executed: false,
                  retryable: false,
                })
              : await tools.execute(call.name, call.arguments, {
                  signal: options.signal,
                  maxResultChars: options.maxResultChars,
                });

        if (!tools.get(call.name)?.readOnlyCompatible) {
          if (result.status === 'unknown' || result.status === 'interrupted' || result.executed === 'unknown') {
            uncertain.add(key);
          }
        }

        const serialized = serializeToolResult(result, options.maxResultChars);

        options.onToolResult?.(call, result);
        messages.push(options.toolMessage(call, serialized));
        toolRound.calls.push({
          name: call.name,
          arguments: call.arguments,
          result: serialized,
        });
      }
    } finally {
      if (toolRound.calls.length > 0) {
        options.onRound?.(toolRound);
      }
    }

    if (options.signal?.aborted) {
      throw new Error('Generation aborted');
    }
  }
}
