import type { ToolExecutionResult } from "../..";
import { readBranchName, readRemote } from "./git_arguments";
import type { GitPlan } from "./git_plan";
import { FOLDER_PARAMETER, GitTool } from "./git_tool";
import { t } from "../../../i18n";

const NETWORK_TIMEOUT_MS = 120_000;

export class GitPullTool extends GitTool {
	readonly id = "git_pull";
	readonly name = "Git Pull";
	readonly readOnlyCompatible = false;
	readonly permissionDefault = "ask" as const;
	readonly description =
		"Fast-forwards the current branch from a remote (git pull --ff-only). It never creates a merge or rewrites history: git refuses when the branches have diverged.";
	readonly parameters = {
		type: "object" as const,
		properties: {
			remote: {
				type: "string",
				description: "Name of a configured remote (default origin).",
			},
			branch: {
				type: "string",
				description:
					"Remote branch (default: the upstream of the current branch).",
			},
			folder: FOLDER_PARAMETER,
		},
	};

	protected async plan(input: unknown): Promise<GitPlan | ToolExecutionResult> {
		const remote = readRemote(input, "remote");
		const branch = readBranchName(input, "branch");

		if (remote instanceof Error) {
			return this.reject(remote.message);
		}

		if (branch instanceof Error) {
			return this.reject(branch.message);
		}

		return {
			args: ["pull", "--ff-only", remote, ...(branch ? [branch] : [])],
			action: `pull ${branch ?? "the current branch"} from the git remote ${remote}`,
			actionLabel: t("action.git.pull", {
				branch: branch ?? t("action.git.currentBranch"),
				remote,
			}),
			timeoutMs: NETWORK_TIMEOUT_MS,
		};
	}
}
