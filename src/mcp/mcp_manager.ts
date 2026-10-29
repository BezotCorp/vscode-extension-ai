import * as vscode from 'vscode';

import { Tool, ToolAccessGuard } from '../tools';
import { McpServerConfig, McpToolInfo } from '.';
import { McpClient } from './mcp_client';
import { McpTool } from './mcp_tool';

const RETRY_AFTER_FAILURE_MS = 30_000;

type McpServerEntry = {
  configKey: string;
  client: McpClient;
  tools: McpToolInfo[];
};

type McpStartFailure = {
  configKey: string;
  at: number;
};

export class McpManager {
  private readonly servers = new Map<string, McpServerEntry>();
  private readonly failures = new Map<string, McpStartFailure>();

  constructor(private readonly getServerConfigs: () => Record<string, McpServerConfig>) {}

  // Starts configured servers on demand, discovers their tools and wraps them as permission-checked tools.
  async createTools(accessGuard: ToolAccessGuard): Promise<Tool[]> {
    const configs = this.getServerConfigs();

    this.dropStaleServers(configs);

    await Promise.all(
      Object.entries(configs)
        .filter(([name, config]) => !this.servers.has(name) && this.canTryStart(name, config))
        .map(([name, config]) => this.startServer(name, config)),
    );
    await Promise.all([...this.servers.entries()].map(([name, entry]) => this.refreshTools(name, entry)));

    return [...this.servers.entries()].flatMap(([serverName, entry]) =>
      entry.tools.map((info) => new McpTool(serverName, info, entry.client, accessGuard)),
    );
  }

  dispose(): void {
    for (const entry of this.servers.values()) {
      entry.client.dispose();
    }

    this.servers.clear();
  }

  private dropStaleServers(configs: Record<string, McpServerConfig>): void {
    for (const [name, entry] of [...this.servers.entries()]) {
      const config = configs[name];

      if (!config || entry.client.isClosed || JSON.stringify(config) !== entry.configKey) {
        entry.client.dispose();
        this.servers.delete(name);
      }
    }
  }

  // A server that just failed with the same configuration is not relaunched at every message.
  private canTryStart(name: string, config: McpServerConfig): boolean {
    const failure = this.failures.get(name);

    return !failure || failure.configKey !== JSON.stringify(config) || Date.now() - failure.at > RETRY_AFTER_FAILURE_MS;
  }

  private async refreshTools(name: string, entry: McpServerEntry): Promise<void> {
    if (!entry.client.hasStaleTools) {
      return;
    }

    try {
      entry.tools = await entry.client.listTools();
    } catch (error) {
      console.error(`BezotCorp AI: could not refresh the tools of MCP server "${name}": ${String(error)}`);
    }
  }

  private async startServer(name: string, config: McpServerConfig): Promise<void> {
    const configKey = JSON.stringify(config);

    // "/" separates server and tool in permission scopes.
    if (name.includes('/') || !config.command) {
      this.reportFailure(name, configKey, 'its name contains "/" or it has no command');
      return;
    }

    try {
      const client = await McpClient.start(config);

      this.failures.delete(name);
      this.servers.set(name, { configKey, client, tools: await client.listTools() });
    } catch (error) {
      this.reportFailure(name, configKey, error instanceof Error ? error.message : String(error));
    }
  }

  private reportFailure(name: string, configKey: string, reason: string): void {
    const repeated = this.failures.get(name)?.configKey === configKey;

    this.failures.set(name, { configKey, at: Date.now() });
    console.error(`BezotCorp AI: MCP server "${name}" failed to start: ${reason}`);

    if (!repeated) {
      void vscode.window.showWarningMessage(`BezotCorp AI: MCP server "${name}" failed to start: ${reason}`);
    }
  }
}
