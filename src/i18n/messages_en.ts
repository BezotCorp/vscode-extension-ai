// English catalog. It is the reference: messages_fr.ts must define exactly the same keys.
// Placeholders are written {name}. Identifiers and the text the model reads are not translated and do not live here.
export const en = {
	// Permission lifetimes
	"lifetime.currentSession": "Current session",
	"lifetime.allSessions": "All sessions",

	// Policies
	"policy.allow.label": "Allow: runs without asking",
	"policy.ask.label": "Ask: confirm at each call",
	"policy.deny.label": "Deny: the AI cannot use it",
	"policy.allow.short": "allow",
	"policy.ask.short": "ask",
	"policy.deny.short": "deny",
	"policy.default.short": "default",
	"policy.useDefault": "Use the default ({policy})",

	// Resource grant kinds
	"resourceKind.exact": "exact resource",
	"resourceKind.directory": "folder",
	"resourceKind.structuralWorkspace": "detected workspace",

	// Permission manager
	"manage.title": "BezotCorp AI permissions",
	"manage.placeholder": "Pick a tool or resource permission",
	"manage.revokeResource": "Revoke this resource permission",
	"manage.groupResources": "Resource access",
	"manage.groupMaintenance": "Maintenance",
	"manage.resetToolsCurrent": "Reset tool decisions for the current session",
	"manage.resetToolsAll": "Reset tool decisions for all sessions",
	"manage.clearResourcesCurrent":
		"Clear resource permissions for the current session",
	"manage.clearResourcesAll": "Clear resource permissions for all sessions",
	"manage.editProtected": "Edit protected paths…",
	"manage.toolPlaceholder": "What may the AI do with this tool?",
	"manage.keepFor": "Keep this decision for…",
	"manage.removeFor": "Remove the decision kept for…",
	"manage.revokedAll": "BezotCorp AI: all permissions revoked.",

	// Tool groups
	"group.files": "Files and workspace",
	"group.git": "Git",
	"group.network": "Network",
	"group.mcp": "MCP: {server}",

	// Tool summaries (permission manager)
	"toolSummary.read_file": "Reads a file.",
	"toolSummary.list_files": "Lists the files of a folder.",
	"toolSummary.search_text": "Searches text in files.",
	"toolSummary.create_file": "Creates a new file.",
	"toolSummary.update_file": "Changes the content of an existing file.",
	"toolSummary.delete_file": "Moves a file or folder to the trash.",
	"toolSummary.move_file": "Moves or renames a file or folder.",
	"toolSummary.web_fetch": "Sends an HTTP request and reads the response.",
	"toolSummary.git_status": "Shows the state of the repository.",
	"toolSummary.git_diff": "Shows the changes of the repository.",
	"toolSummary.git_log": "Shows the commit history.",
	"toolSummary.git_show": "Shows a commit or an object.",
	"toolSummary.git_branch_list": "Lists the branches.",
	"toolSummary.git_add": "Stages files.",
	"toolSummary.git_unstage": "Unstages files.",
	"toolSummary.git_commit": "Creates a commit from the staged changes.",
	"toolSummary.git_branch_create": "Creates a branch.",
	"toolSummary.git_switch": "Switches to another branch.",
	"toolSummary.git_fetch": "Fetches the changes of a remote.",
	"toolSummary.git_pull": "Pulls a branch from a remote (fast-forward only).",
	"toolSummary.git_push": "Pushes a branch to a remote.",

	// Permission dialog
	"dialog.title": "BezotCorp AI wants to {action}",
	"dialog.critical": "CRITICAL OPERATION",
	"dialog.tool": "Tool: {tool}",
	"dialog.action": "Action: {action}",
	"dialog.target": "Target: {target}",
	"dialog.whyCritical": "Why it is critical: {reason}",
	"dialog.aiReason": "Reason given by the AI: {reason}",
	"dialog.criticalWarning":
		"Warning: a wrong operation here can damage the system, make a service unusable or cause data loss.",
	"dialog.closeNotRefusal":
		"Closing this dialog is not a refusal: nothing runs and the AI is told no decision was made.",
	"dialog.moreLines": "… {count} more lines",
	"dialog.refusedTitle": "Refused",
	"dialog.refusedPrompt":
		"Tell the AI what to do instead (optional, Escape to skip).",
	"dialog.reason.critical":
		"This is a critical operation: it always needs your answer, once.",
	"dialog.reason.protected":
		"This touches a protected resource ({pattern}), which always needs your answer.",
	"dialog.reason.askEvery": "{tool} is set to ask every time.",
	"dialog.reason.structural":
		"The requested resource is outside the current VS Code window but belongs to the detected {kind} workspace {root}. Detection itself grants nothing.",
	"dialog.reason.outside":
		"The requested resource is outside the current VS Code window and is not covered by a remembered resource permission.",
	"dialog.button.yes": "Yes",
	"dialog.button.no": "No",
	"dialog.button.toolCurrent": "Yes, allow this tool for the current session",
	"dialog.button.toolAll": "Yes, allow this tool for all sessions",
	"dialog.button.resourcesCurrent":
		"Yes, allow these resources for the current session",
	"dialog.button.resourcesAll": "Yes, allow these resources for all sessions",
	"dialog.button.workspaceCurrent":
		"Yes, allow this detected workspace for the current session",
	"dialog.button.workspaceAll":
		"Yes, allow this detected workspace for all sessions",

	// Why a location is critical
	"critical.home": "the home folder or one of its parents",
	"critical.window": "a folder of the current window or one of its parents",
	"critical.git": "the repository metadata (.git)",
	"critical.system": "a system location",

	// Actions shown in the permission dialog
	"action.read.file": "read file {path}",
	"action.read.folder": "read folder {path}",
	"action.search.file": "search file {path}",
	"action.search.folder": "search folder {path}",
	"action.create.file": "create file {path}",
	"action.create.folder": "create folder {path}",
	"action.write.file": "modify file {path}",
	"action.write.folder": "modify folder {path}",
	"action.delete.file": "delete file {path}",
	"action.delete.folder": "delete folder {path}",
	"action.move.file": "move file {path}",
	"action.move.folder": "move folder {path}",
	"action.git.run": "run {tool} in {repository}",
	"action.git.push": "push {branch} to the git remote {remote}",
	"action.git.pull": "pull {branch} from the git remote {remote}",
	"action.git.fetch": "fetch from the git remote {remote}",
	"action.git.switch": "switch to the git branch {branch}",
	"action.git.branchCreate": "create the git branch {branch}",
	"action.git.commit": "create a git commit",
	"action.git.add": "stage {count} path(s) with git",
	"action.git.unstage": "unstage {count} path(s) with git",
	"action.git.currentBranch": "the current branch",
	"action.mcp.call": "call the MCP tool {tool}",
	"action.web.request": "send a {method} request to {host}",

	// Details shown in the permission dialog
	"detail.destination": "Destination: {path}",
	"detail.folderToTrash": "Folder: everything inside it is moved to the trash.",
	"detail.content": "{chars} characters, {lines} lines. Starts with: {start}",
	"detail.body": "Body: {content}",
	"detail.line": "Line {line}:",
	"detail.commit": "Message: {message}\nStaged:\n{staged}",
	"detail.stagedUnknown": "(could not be listed)",
	"detail.arguments": "Arguments: {arguments}",
	"warning.privateNetwork":
		"Warning: this address is on the local or private network, not the public internet.",

	// Notifications
	"notify.writesResumed":
		"BezotCorp AI: {count} interrupted file write(s) were resumed. Final state: {states}.",
	"notify.writesNotResumed":
		"BezotCorp AI: interrupted file writes could not be resumed: {error}",
	"notify.mcpFailed":
		'BezotCorp AI: MCP server "{name}" failed to start: {reason}',
	"notify.storageUnreadable":
		"BezotCorp AI: the saved conversations could not be read ({reason}). The file was kept as {path}.",
	"notify.storageSaveFailed": "Could not save the conversations: {error}",
	"notify.updateStopped":
		"BezotCorp AI: update_file was stopped on {path}. The file kept changing between attempts, so the operation could not be done. No change was applied to the file.",
	"notify.writeNotRestored":
		"BezotCorp AI: {path} could not be written correctly and could not be restored. The original is kept at {backup}.",
	"notify.error": "BezotCorp AI: {error}",

	// Chat
	"chat.defaultTitle": "New conversation",
	"chat.errorPrefix": "Error: {error}",
	"chat.notice.noTools":
		"[tools] {model} does not support tool calling; answering without tools.",
	"chat.notice.contextFull":
		"[context] the model context is full; answering with what was gathered.",
	"chat.confirm.delete.title": "Permanently delete this conversation?",
	"chat.confirm.delete.detail": "This action cannot be undone.",
	"chat.confirm.delete.button": "Delete permanently",
	"chat.confirm.clear.title": "Clear the current conversation?",
	"chat.confirm.clear.detail":
		"The conversation will remain available but all its messages will be deleted.",
	"chat.confirm.clear.button": "Clear",
	"chat.confirm.emptyTrash.title": "Permanently empty the trash?",
	"chat.confirm.emptyTrash.detail":
		"All conversations in the trash will be permanently deleted.",
	"chat.confirm.emptyTrash.button": "Empty the trash",

	// Backend status
	"status.connecting": "Connecting to {provider}...",
	"status.connectedOllama": "Connected to Ollama",
	"status.connected": "Connected",
	"status.disconnected": "Disconnected: {error}",
	"status.hostedUnavailable": "BezotCorp hosted backend is not available yet.",
	"status.hostedUnavailableChat":
		"BezotCorp hosted backend is not available yet. Please use Ollama or a custom backend for now.",

	// Webview (sent to the page)
	"ui.newConversation": "New conversation",
	"ui.history": "History",
	"ui.configuration": "Configuration",
	"ui.filterActive": "Active",
	"ui.filterArchived": "Archived",
	"ui.filterTrash": "Trash",
	"ui.historyEmpty": "No conversations.",
	"ui.clearCurrent": "Clear the current conversation",
	"ui.trashArchived": "Move archives to the trash",
	"ui.emptyTrash": "Empty the trash",
	"ui.backendUnavailable": "Backend unavailable",
	"ui.openConfiguration": "Open the configuration",
	"ui.activeModel": "Active model",
	"ui.configure": "Configure",
	"ui.placeholder": "Ask your question...",
	"ui.send": "Send",
	"ui.stop": "Stop",
	"ui.provider": "Provider",
	"ui.providerCustom": "Custom backend",
	"ui.backendUrl": "Backend URL",
	"ui.apply": "Apply",
	"ui.testConnection": "Test the connection",
	"ui.refreshModels": "Refresh the models",
	"ui.advancedSettings": "Advanced settings",
	"ui.noModel": "No model available",
	"ui.modelError": "Error while loading the models: {error}",
	"ui.urlLabel": "URL: {url}",
	"ui.copy": "Copy",
	"ui.copyTitle": "Copy the answer",
	"ui.actionsFor": "Actions for {title}",
	"ui.restore": "Restore",
	"ui.deleteForever": "Delete permanently",
	"ui.moveToTrash": "Move to the trash",
	"ui.rename": "Rename",
	"ui.archive": "Archive",
} as const;

export type MessageKey = keyof typeof en;
