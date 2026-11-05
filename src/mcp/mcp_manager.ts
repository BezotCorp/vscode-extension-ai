import * as vscode from "vscode";
import { McpStartFailure } from "./mcp_start_failure";
import { Tool, ToolAccessGuard } from "../tools";
import {
	McpServerConfig,
	McpToolDescriptor,
	McpToolInfo,
	McpServerEntry,
} from ".";
import { McpClient } from "./mcp_client";
import { McpTool, mcpToolId } from "./mcp_tool";
import { t } from "../i18n";

const RETRY_AFTER_FAILURE_MS = 30_000;
// A message does not wait longer than this for servers that are still starting; they join at the next message.
const STARTUP_WAIT_MS = 8_000;
// A server nobody has called for this long is stopped, and restarted on demand.
const IDLE_STOP_MS = 10 * 60_000;
const IDLE_CHECK_MS = 60_000;

export class McpManager {
	private readonly servers = new Map<string, McpServerEntry>();
	private readonly starting = new Map<string, Promise<void>>();
	private readonly failures = new Map<string, McpStartFailure>();
	private idleTimer: NodeJS.Timeout | undefined;

	constructor(
		private readonly getServerConfigs: () => Record<string, McpServerConfig>,
	) {}

	// Starts configured servers on demand, discovers their tools and wraps them as permission-checked tools.
	async createTools(
		accessGuard: ToolAccessGuard,
		signal?: AbortSignal,
	): Promise<Tool[]> {
		if (!(await this.ensureServers(signal))) {
			return [];
		}

		const usedIds = new Set<string>();
		const now = Date.now();

		return [...this.servers.entries()].flatMap(([serverName, entry]) => {
			entry.lastUsed = now;

			return entry.tools.map((info) => {
				const id = uniqueId(mcpToolId(serverName, info.name), usedIds);

				return new McpTool(serverName, info, entry.client, accessGuard, id);
			});
		});
	}

	// The tools of the configured servers, for the permission manager.
	async describeTools(signal?: AbortSignal): Promise<McpToolDescriptor[]> {
		if (!(await this.ensureServers(signal))) {
			return [];
		}

		return [...this.servers.entries()].flatMap(([server, entry]) =>
			entry.tools.map((info) => ({
				permissionKey: `mcp__${server}__${info.name}`,
				server,
				name: info.name,
				description: (info.description ?? info.name).slice(0, 300),
			})),
		);
	}

	// Starts the configured servers that are not running. False when the workspace is not trusted: servers are
	// programs from the user's settings, but they would run with the folder's files and cwd.
	private async ensureServers(signal?: AbortSignal): Promise<boolean> {
		if (!vscode.workspace.isTrusted) {
			this.dispose();
			return false;
		}

		const configs = this.getServerConfigs();

		this.sync(configs);

		for (const [name, config] of Object.entries(configs)) {
			if (
				!this.servers.has(name) &&
				!this.starting.has(name) &&
				this.canTryStart(name, config)
			) {
				this.starting.set(
					name,
					this.startServer(name, config).finally(() =>
						this.starting.delete(name),
					),
				);
			}
		}

		await waitFor([...this.starting.values()], STARTUP_WAIT_MS, signal);
		await Promise.all(
			[...this.servers.entries()].map(([name, entry]) =>
				this.refreshTools(name, entry),
			),
		);

		this.watchIdleServers();

		return true;
	}

	// Stops servers that were removed, changed or have exited. Called before each use and when settings change.
	sync(
		configs: Record<string, McpServerConfig> = this.getServerConfigs(),
	): void {
		for (const [name, entry] of [...this.servers.entries()]) {
			const config = configs[name];

			if (
				!config ||
				entry.client.isClosed ||
				JSON.stringify(config) !== entry.configKey
			) {
				entry.client.dispose();
				this.servers.delete(name);
			}
		}
	}

	dispose(): void {
		if (this.idleTimer) {
			clearInterval(this.idleTimer);
			this.idleTimer = undefined;
		}

		for (const entry of this.servers.values()) {
			entry.client.dispose();
		}

		this.servers.clear();
	}

	private watchIdleServers(): void {
		if (this.idleTimer || this.servers.size === 0) {
			return;
		}

		this.idleTimer = setInterval(() => {
			for (const [name, entry] of [...this.servers.entries()]) {
				if (Date.now() - entry.lastUsed > IDLE_STOP_MS) {
					entry.client.dispose();
					this.servers.delete(name);
				}
			}

			if (this.servers.size === 0 && this.idleTimer) {
				clearInterval(this.idleTimer);
				this.idleTimer = undefined;
			}
		}, IDLE_CHECK_MS);
		this.idleTimer.unref();
	}

	// A server that just failed with the same configuration is not relaunched at every message.
	private canTryStart(name: string, config: McpServerConfig): boolean {
		const failure = this.failures.get(name);

		return (
			!failure ||
			failure.configKey !== JSON.stringify(config) ||
			Date.now() - failure.at > RETRY_AFTER_FAILURE_MS
		);
	}

	private async refreshTools(
		name: string,
		entry: McpServerEntry,
	): Promise<void> {
		if (!entry.client.hasStaleTools) {
			return;
		}

		try {
			entry.tools = await entry.client.listTools();
		} catch (error) {
			console.error(
				`BezotCorp AI: could not refresh the tools of MCP server "${name}": ${String(error)}`,
			);
		}
	}

	private async startServer(
		name: string,
		config: McpServerConfig,
	): Promise<void> {
		const configKey = JSON.stringify(config);

		// "/" separates server and tool in permission scopes, "__" in rule names.
		if (name.includes("/") || name.includes("__") || !config.command) {
			this.reportFailure(
				name,
				configKey,
				'its name contains "/" or "__", or it has no command',
			);
			return;
		}

		try {
			const client = await McpClient.start(config);

			try {
				const tools = await client.listTools();

				// The settings may have changed while the server was starting.
				if (JSON.stringify(this.getServerConfigs()[name]) !== configKey) {
					client.dispose();
					return;
				}

				this.failures.delete(name);
				this.servers.set(name, {
					configKey,
					client,
					tools,
					lastUsed: Date.now(),
				});
			} catch (error) {
				client.dispose();
				throw error;
			}
		} catch (error) {
			this.reportFailure(
				name,
				configKey,
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private reportFailure(name: string, configKey: string, reason: string): void {
		const repeated = this.failures.get(name)?.configKey === configKey;

		this.failures.set(name, { configKey, at: Date.now() });
		console.error(
			`BezotCorp AI: MCP server "${name}" failed to start: ${reason}`,
		);

		if (!repeated) {
			void vscode.window.showWarningMessage(
				t("notify.mcpFailed", { name, reason }),
			);
		}
	}
}

// Resolves when the promises settle, the delay passes, or the signal aborts, whichever comes first.
function waitFor(
	promises: Promise<void>[],
	delayMs: number,
	signal?: AbortSignal,
): Promise<void> {
	if (promises.length === 0) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		const timer = setTimeout(done, delayMs);
		const onAbort = () => done();

		function done(): void {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}

		signal?.addEventListener("abort", onAbort, { once: true });
		void Promise.allSettled(promises).then(done);
	});
}

// Sanitizing and shortening names can make two different tools share an id, and the registry would keep only one.
function uniqueId(id: string, used: Set<string>): string {
	let candidate = id;

	for (let attempt = 2; used.has(candidate); attempt++) {
		const suffix = `_${attempt}`;

		candidate = `${id.slice(0, 64 - suffix.length)}${suffix}`;
	}

	used.add(candidate);

	return candidate;
}
