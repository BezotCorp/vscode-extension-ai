import { ChildProcess, spawn } from 'node:child_process';

import { getWorkspaceRoot } from '../workspace';
import { McpServerConfig, McpToolInfo } from '.';
import { McpRequestError } from './mcp_request_error';

const PROTOCOL_VERSION = '2024-11-05';
const STARTUP_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 60_000;
const STDERR_TAIL_CHARS = 2_000;
const KILL_GRACE_MS = 2_000;

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
};

type JsonRpcMessage = {
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
};

export type McpCallResult = {
  text: string;
  isError: boolean;
  partTypes: string[];
  structuredContent?: unknown;
};

type McpContentPart = {
  type: string;
  text?: string;
  mimeType?: string;
  data?: string;
  resource?: { uri?: string; text?: string; mimeType?: string };
};

// Minimal MCP client over stdio (newline-delimited JSON-RPC).
export class McpClient {
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private buffer = '';
  private stderrTail = '';
  private closed = false;
  private toolsStale = false;

  private constructor(private readonly child: ChildProcess) {
    child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_CHARS);
    });
    // Writing to a dead server must not crash the extension host.
    child.stdin?.on('error', () => undefined);
    child.on('error', (error) => this.close(`MCP server failed: ${error.message}`));
    child.on('close', (code) => this.close(`MCP server exited (code ${code}).`));
  }

  static async start(config: McpServerConfig): Promise<McpClient> {
    const child = spawn(config.command, config.args ?? [], {
      cwd: config.cwd ?? getWorkspaceRoot(),
      env: { ...process.env, ...config.env },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const client = new McpClient(child);

    try {
      await client.request(
        'initialize',
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'bezotcorp-ai', version: '1.0.0' },
        },
        STARTUP_TIMEOUT_MS,
      );
      client.notify('notifications/initialized');
    } catch (error) {
      client.dispose();
      throw error;
    }

    return client;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // True once the server announced that its tool list changed.
  get hasStaleTools(): boolean {
    return this.toolsStale;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const tools: McpToolInfo[] = [];
    let cursor: string | undefined;

    do {
      const page = (await this.request('tools/list', cursor ? { cursor } : {})) as {
        tools?: McpToolInfo[];
        nextCursor?: string;
      };

      tools.push(...(page.tools ?? []));
      cursor = page.nextCursor;
    } while (cursor);

    return tools;
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpCallResult> {
    const result = (await this.request('tools/call', { name, arguments: args ?? {} }, REQUEST_TIMEOUT_MS, signal)) as {
      content?: McpContentPart[];
      isError?: boolean;
      structuredContent?: unknown;
    };
    const parts = result.content ?? [];

    return {
      text: parts.map(describePart).join('\n'),
      isError: result.isError === true,
      partTypes: parts.map((part) => part.type),
      structuredContent: result.structuredContent,
    };
  }

  // Stops the server: polite first, forced if it does not exit.
  dispose(): void {
    this.close('MCP server was stopped.');

    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }

    this.child.kill('SIGTERM');

    const killTimer = setTimeout(() => this.child.kill('SIGKILL'), KILL_GRACE_MS);

    killTimer.unref();
    this.child.once('exit', () => clearTimeout(killTimer));
  }

  private request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal) {
    return new Promise<unknown>((resolve, reject) => {
      if (this.closed) {
        reject(new McpRequestError('not_running', 'MCP server is not running.'));
        return;
      }

      const id = this.nextId++;
      const finish = (action: () => void) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(id);
        action();
      };
      const onAbort = () => {
        this.notify('notifications/cancelled', { requestId: id, reason: 'Cancelled by the user' });
        finish(() => reject(new McpRequestError('cancelled', 'MCP request cancelled.')));
      };
      const timer = setTimeout(
        () => finish(() =>
            reject(new McpRequestError('timeout', `MCP request "${method}" timed out after ${timeoutMs} ms.`)),
          ),
        timeoutMs,
      );

      this.pending.set(id, {
        resolve: (value) => finish(() => resolve(value)),
        reject: (error) => finish(() => reject(error)),
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(message: unknown): void {
    if (!this.closed) {
      this.child.stdin?.write(`${JSON.stringify(message)}\n`);
    }
  }

  private onData(text: string): void {
    this.buffer += text;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        this.onMessage(line);
      }
    }
  }

  private onMessage(line: string): void {
    let message: JsonRpcMessage;

    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return;
    }

    if (message.method === 'notifications/tools/list_changed') {
      this.toolsStale = true;
      return;
    }

    if (message.method && message.id !== undefined) {
      // Requests from the server are never honoured (no sampling, no roots), except ping.
      const reply =
        message.method === 'ping'
          ? { jsonrpc: '2.0', id: message.id, result: {} }
          : { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not supported' } };

      this.send(reply);
      return;
    }

    if (typeof message.id !== 'number') {
      return;
    }

    const pending = this.pending.get(message.id);

    if (!pending) {
      return;
    }

    if (message.error) {
      pending.reject(new McpRequestError('protocol', message.error.message, message.error.code));
    } else {
      pending.resolve(message.result);
    }
  }

  private close(reason: string): void {
    this.closed = true;

    for (const pending of [...this.pending.values()]) {
      pending.reject(new McpRequestError('closed', reason, undefined, this.stderrTail.trim() || undefined));
    }
  }
}

function describePart(part: McpContentPart): string {
  switch (part.type) {
    case 'text':
      return part.text ?? '';
    case 'resource':
      return part.resource?.text ?? `[resource ${part.resource?.uri ?? ''}]`;
    case 'image':
    case 'audio':
      return `[${part.type} ${part.mimeType ?? ''}, ${part.data?.length ?? 0} base64 characters not shown]`;
    default:
      return `[${part.type}]`;
  }
}
