import { ToolAccessProfile } from '../permissions';
import { Tool, ToolDefinition, UnavailableTool, ToolExecutionContext, ToolExecutionResult } from '.';
import { toolFailure } from './tool_result';
import { toolFailureFromException } from './tool_failure_from_exception';
import { validateToolInput } from './tool_validation';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  private readonly unavailable: UnavailableTool[] = [];

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  // Remembers a tool that is not offered, so the model can be told what it cannot do and why.
  markUnavailable(tool: ToolAccessProfile, reason: string): void {
    const id = tool.permissionKey ?? tool.id;

    // A tool that several entries share (a file tool and its plural form) is reported once.
    if (!this.unavailable.some((entry) => entry.id === id)) {
      this.unavailable.push({ id, name: tool.name, reason });
    }
  }

  unavailableTools(): UnavailableTool[] {
    return [...this.unavailable];
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
      return toolFailureFromException(tool, error, context);
    }
  }
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
