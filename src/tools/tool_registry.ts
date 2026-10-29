import { PermissionError } from '../permissions';
import { Tool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '.';
import { toolErrorFromException, toolFailure } from './tool_result';
import { validateToolInput } from './tool_validation';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  get(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  definitions(): ToolDefinition[] {
    return this.list().map((tool) => ({
      name: tool.id,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async execute(toolId: string, input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolId);

    if (!tool) {
      return toolFailure('error', toolId, undefined, {
        reason: 'unknown_tool',
        message: `Unknown tool "${toolId}". Available tools: ${this.list()
          .map((candidate) => candidate.id)
          .join(', ')}.`,
        executed: false,
        retryable: true,
      });
    }

    const parsed = parseToolInput(input);

    if (parsed.error) {
      return toolFailure('error', toolId, undefined, {
        reason: 'invalid_arguments',
        message: parsed.error,
        executed: false,
        retryable: true,
      });
    }

    const problem = validateToolInput(tool.parameters, parsed.value);

    if (problem) {
      return toolFailure('error', toolId, undefined, {
        reason: 'invalid_arguments',
        message: `Invalid arguments: ${problem}.`,
        executed: false,
        retryable: true,
      });
    }

    if (context?.signal?.aborted) {
      return toolFailure('cancelled', toolId, undefined, {
        reason: 'cancelled_by_user',
        message: 'The request was cancelled before the tool started. Nothing was executed.',
        executed: false,
        retryable: true,
      });
    }

    try {
      return await tool.execute(parsed.value, context);
    } catch (error) {
      return failureFromException(tool, error, context);
    }
  }
}

function failureFromException(tool: Tool, error: unknown, context?: ToolExecutionContext): ToolExecutionResult {
  if (error instanceof PermissionError) {
    const resource = error.scope ? `${error.scope.kind} ${error.scope.value}` : undefined;

    if (error.kind === 'no_decision') {
      return toolFailure('cancelled', tool.id, resource, {
        reason: error.reason,
        message: error.message,
        executed: false,
        retryable: true,
      });
    }

    return toolFailure('denied', tool.id, resource, {
      reason: error.reason,
      message: error.message,
      executed: false,
      retryable: false,
      details: { decidedBy: error.kind === 'user_refused' ? 'user' : 'policy', ...error.details },
    });
  }

  if (context?.signal?.aborted || (error as { name?: string } | null)?.name === 'AbortError') {
    return toolFailure('cancelled', tool.id, undefined, {
      reason: 'cancelled_by_user',
      message: 'The operation was cancelled. If it had already started, it may have partially run.',
      executed: tool.readOnlyCompatible ? false : 'unknown',
      retryable: false,
    });
  }

  return toolErrorFromException(tool.id, undefined, error, !tool.readOnlyCompatible);
}

function parseToolInput(input: unknown): { value?: unknown; error?: string } {
  if (typeof input !== 'string') {
    return { value: input ?? {} };
  }

  try {
    return { value: JSON.parse(input) };
  } catch {
    return { error: `Tool arguments were not valid JSON: ${input.slice(0, 120)}` };
  }
}
