import { ToolCall, ToolExecutionResult, ToolRegistry } from '.';
import { serializeToolResult, toolFailure } from './tool_result';

const MAX_CALLS_PER_ROUND = 8;

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
};

export async function runToolLoop<TMessage>(options: ToolLoopOptions<TMessage>): Promise<void> {
  const { messages, tools, maxRounds } = options;
  // Calls with side effects whose outcome is uncertain: not repeated until the state has been inspected.
  const uncertain = new Set<string>();

  for (let round = 0; round <= maxRounds; round++) {
    const allowTools = tools !== undefined && round < maxRounds;
    const { content, toolCalls } = await options.runRound(messages, allowTools);

    if (!tools || toolCalls.length === 0) {
      return;
    }

    // The protocol needs the assistant message with all its calls, then one tool message per call.
    messages.push(options.assistantMessage(content, toolCalls));

    for (const [index, call] of toolCalls.entries()) {
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
                  'An identical call ended with an uncertain outcome and is not repeated automatically. Inspect the current state with a read-only tool first, or ask the user.',
                executed: false,
                retryable: false,
              })
            : await tools.execute(call.name, call.arguments, { signal: options.signal });

      if (tools.get(call.name)?.readOnlyCompatible) {
        uncertain.clear();
      } else if (result.status === 'unknown' || result.status === 'interrupted' || result.executed === 'unknown') {
        uncertain.add(key);
      }

      options.onToolResult?.(call, result);
      messages.push(options.toolMessage(call, serializeToolResult(result)));
    }

    if (options.signal?.aborted) {
      throw new Error('Generation aborted');
    }
  }
}
