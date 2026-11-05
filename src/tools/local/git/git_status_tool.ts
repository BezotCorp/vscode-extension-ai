import type { ToolExecutionResult } from "../..";
import { FOLDER_PARAMETER, GitTool } from "./git_tool";
import type { GitPlan } from "./git_plan";

export class GitStatusTool extends GitTool {
	readonly id = "git_status";
	readonly name = "Git Status";
	readonly readOnlyCompatible = true;
	readonly permissionDefault = "allow" as const;
	readonly description =
		"Shows the current branch and the changed, staged and untracked files of the repository (git status).";
	readonly parameters = {
		type: "object" as const,
		properties: { folder: FOLDER_PARAMETER },
	};

	protected async plan(): Promise<GitPlan | ToolExecutionResult> {
		return {
			args: [
				"status",
				"--porcelain=v1",
				"--branch",
				"--untracked-files=normal",
			],
		};
	}
}
