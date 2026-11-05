import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { ResolvedPath } from ".";

// Where the operating system keeps what it runs on. Touching these is what "critical" means beyond the user's own
// folders: a mistake there can make the machine or a service unusable.
function systemRoots(): string[] {
	switch (process.platform) {
		case "win32":
			return [
				process.env.SystemRoot,
				process.env.ProgramFiles,
				process.env["ProgramFiles(x86)"],
			].filter((root): root is string => Boolean(root));
		case "darwin":
			return [
				"/System",
				"/Library",
				"/bin",
				"/sbin",
				"/usr/bin",
				"/usr/sbin",
				"/usr/lib",
				"/private/etc",
				"/private/var/db",
				"/private/var/run",
			];
		default:
			return [
				"/bin",
				"/boot",
				"/dev",
				"/etc",
				"/lib",
				"/lib32",
				"/lib64",
				"/proc",
				"/sbin",
				"/sys",
				"/run",
				"/usr/bin",
				"/usr/sbin",
				"/usr/lib",
				"/usr/lib32",
				"/usr/lib64",
				"/usr/local/bin",
				"/usr/local/sbin",
				"/usr/local/lib",
				"/var/lib",
				"/var/run",
				"/var/spool",
			];
	}
}

// Why a path is a critical location, if it is one: the folders a user's work and account stand on (a folder of the
// current window or one of its parents, the home folder or one of its parents, which includes the filesystem root),
// the repository metadata of such a folder (.git and everything below it), or a system location. Creating, writing, deleting or moving there needs the
// strongest confirmation; reading never does (the caller decides). Being critical does not depend on the perimeter the
// user allowed: a system location stays critical inside the current window or the home folder.
export function describeCriticalPath(
	resolved: ResolvedPath,
): string | undefined {
	if (resolved.uri.scheme !== "file") {
		return undefined;
	}

	const target = path.resolve(resolved.uri.fsPath);
	const home = os.homedir();

	if (isInsideOrSame(home, target)) {
		return "the home folder or one of its parents";
	}

	const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) =>
		path.resolve(folder.uri.fsPath),
	);

	for (const root of roots) {
		if (isInsideOrSame(root, target)) {
			return "a folder of the current window or one of its parents";
		}

		if (isInsideOrSame(target, path.join(root, ".git"))) {
			return "the repository metadata (.git)";
		}
	}

	return systemRoots().some((root) => isInsideOrSame(target, root))
		? "a system location"
		: undefined;
}

// True when `child` is `parent` itself or lies below it.
function isInsideOrSame(child: string, parent: string): boolean {
	return (
		isStrictlyInside(parent, child) ||
		path.resolve(parent) === path.resolve(child)
	);
}

function isStrictlyInside(parent: string, child: string): boolean {
	const relative = path.relative(path.resolve(parent), path.resolve(child));

	return (
		relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
	);
}
