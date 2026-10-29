import { sanitizeForPrompt } from '../permissions';
import {
  Tool,
  ToolAccessGuard,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolParametersSchema,
  toolFailure,
  toolSuccess,
} from '../tools';
import { truncateText } from '../workspace';
import { McpClient, McpToolInfo } from '.';
import { McpRequestError } from './mcp_request_error';

export class McpTool implements Tool {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParametersSchema;
  // A server cannot be assumed read-only: MCP tools are never offered in read-only mode.
  readonly readOnlyCompatible = false;

  constructor(
    private readonly serverName: string,
    private readonly info: McpToolInfo,
    private readonly client: McpClient,
    private readonly accessGuard: ToolAccessGuard,
  ) {
    this.id = `mcp__${serverName}__${info.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    this.name = `${serverName}: ${info.name}`;
    this.description = `[MCP ${serverName}] ${info.description ?? info.name}`;
    this.parameters = {
      type: 'object',
      properties: (info.inputSchema?.properties ?? {}) as ToolParametersSchema['properties'],
      required: info.inputSchema?.required,
    };
  }

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const toolScope = { kind: 'mcpTool' as const, value: `${this.serverName}/${this.info.name}` };
    const resource = toolScope.value;
    const base = { server: this.serverName, tool: this.info.name };

    await this.accessGuard.authorize(
      {
        capability: 'mcp',
        scope: toolScope,
        grantScopes: [toolScope, { kind: 'mcpServer', value: this.serverName }],
        operation: this.id,
        detail: `Arguments: ${sanitizeForPrompt(JSON.stringify(input ?? {}), 500)}`,
      },
      context?.signal,
    );

    try {
      const result = await this.client.callTool(this.info.name, input, context?.signal);
      const text = truncateText(result.text);
      const details = {
        ...base,
        contentParts: result.partTypes,
        truncated: text.truncated,
        ...(result.structuredContent !== undefined && { structuredContent: result.structuredContent }),
      };

      return result.isError
        ? toolFailure('error', this.id, resource, {
            reason: 'mcp_tool_error',
            message: 'The MCP server ran the tool and reported an error.',
            executed: true,
            retryable: false,
            content: text.text,
            details,
          })
        : toolSuccess(this.id, resource, { content: text.text, details });
    } catch (error) {
      if (!(error instanceof McpRequestError)) {
        throw error;
      }

      return this.failureFrom(error, resource, base);
    }
  }

  private failureFrom(error: McpRequestError, resource: string, base: Record<string, string>): ToolExecutionResult {
    switch (error.kind) {
      case 'timeout':
        return toolFailure('unknown', this.id, resource, {
          reason: 'mcp_timeout',
          message: `${error.message} The tool may still have run on the server.`,
          executed: true,
          retryable: false,
          details: base,
        });
      case 'cancelled':
        return toolFailure('cancelled', this.id, resource, {
          reason: 'cancelled_by_user',
          message: 'The call was cancelled and the server was told to stop. It may have partially run.',
          executed: true,
          retryable: false,
          details: base,
        });
      case 'closed':
        return toolFailure('interrupted', this.id, resource, {
          reason: 'mcp_server_exited',
          message: `${error.message} The tool may have partially run.`,
          executed: 'unknown',
          retryable: false,
          details: { ...base, stderr: error.stderrTail },
        });
      case 'not_running':
        return toolFailure('error', this.id, resource, {
          reason: 'mcp_server_not_running',
          message: 'The MCP server is not running. It is restarted at the next message.',
          executed: false,
          retryable: false,
          details: base,
        });
      default:
        return toolFailure('error', this.id, resource, {
          reason: 'mcp_protocol_error',
          message: error.message,
          // -32601 and -32602 are rejections before execution; other codes leave the outcome open.
          executed: error.code === -32601 || error.code === -32602 ? false : 'unknown',
          retryable: false,
          details: { ...base, code: error.code },
        });
    }
  }
}
