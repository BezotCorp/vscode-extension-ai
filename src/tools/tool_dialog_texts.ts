import type { MessageKey } from '../i18n';
import { t } from '../i18n';
import type { PermissionCapability } from '../permissions';

// The dialog buttons are read when a dialog opens, in the language VS Code is displayed in. The answer is compared
// with the same labels, so a button is always recognised.
export const buttons = {
	get allowOnce() {
		return t('dialog.button.yes');
	},
	get allowToolCurrentSession() {
		return t('dialog.button.toolCurrent');
	},
	get allowToolAllSessions() {
		return t('dialog.button.toolAll');
	},
	get allowResourcesCurrentSession() {
		return t('dialog.button.resourcesCurrent');
	},
	get allowResourcesAllSessions() {
		return t('dialog.button.resourcesAll');
	},
	get allowWorkspaceCurrentSession() {
		return t('dialog.button.workspaceCurrent');
	},
	get allowWorkspaceAllSessions() {
		return t('dialog.button.workspaceAll');
	},
	get deny() {
		return t('dialog.button.no');
	},
};

// English verbs of the action the model reads (the dialog has its own, translated).
export const ACTION_LABELS: Record<PermissionCapability, string> = {
	read: 'read',
	search: 'search',
	create: 'create',
	write: 'modify',
	delete: 'delete',
	move: 'move',
};

// What the model reads about a refusal that comes from a stored decision: stable English, not a UI label.
export const LIFETIME_FOR_MODEL = {
	currentSession: 'current session',
	allSessions: 'all sessions',
} as const;

// `describeCriticalPath` answers in English because the model reads it too; the dialog shows it translated.
export const CRITICAL_REASON_KEYS: Record<string, MessageKey> = {
	'the home folder or one of its parents': 'critical.home',
	'a folder of the current window or one of its parents': 'critical.window',
	'the repository metadata (.git)': 'critical.git',
	'a system location': 'critical.system',
};
