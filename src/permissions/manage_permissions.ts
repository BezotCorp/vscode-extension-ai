import * as vscode from 'vscode';

import { t } from '../i18n';
import type { PermissionLifetime, PermissionPolicy, PermissionStore, ToolPermissionInfo } from '.';
import { PERMISSION_LIFETIMES } from './permission_lifetimes';
import type { PermissionItem } from './permission_item';

// Labels are read when the menu opens, in the language VS Code is displayed in.
function lifetimeLabel(lifetime: PermissionLifetime): string {
	return t(`lifetime.${lifetime}`);
}

function policyLabel(policy: PermissionPolicy): string {
	return t(`policy.${policy}.label`);
}

function resetToolItems(): {
	label: string;
	lifetime: PermissionLifetime;
}[] {
	return [
		{
			label: t('manage.resetToolsCurrent'),

			lifetime: 'currentSession',
		},
		{
			label: t('manage.resetToolsAll'),

			lifetime: 'allSessions',
		},
	];
}

export async function managePermissions(
	store: PermissionStore,
	listTools: () => Promise<ToolPermissionInfo[]>,
): Promise<void> {
	for (;;) {
		const tools = await listTools();

		const picked = await vscode.window.showQuickPick(buildItems(store, tools), {
			title: t('manage.title'),

			placeHolder: t('manage.placeholder'),

			matchOnDescription: true,

			matchOnDetail: true,
		});

		if (!picked) {
			return;
		}

		if (picked.grant) {
			const action = await vscode.window.showQuickPick(
				[
					{
						label: t('manage.revokeResource'),
					},
				],
				{
					title: picked.label,
				},
			);

			if (!action) {
				continue;
			}

			await store.removeResourcePermission(picked.grant);

			continue;
		}

		if (picked.label === t('manage.editProtected')) {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'bezotcorpAi.protectedPaths');

			return;
		}

		if (picked.label === t('manage.clearResourcesCurrent')) {
			await store.clearResourcePermissions('currentSession');

			continue;
		}

		if (picked.label === t('manage.clearResourcesAll')) {
			await store.clearResourcePermissions('allSessions');

			continue;
		}

		const reset = resetToolItems().find((item) => item.label === picked.label);

		if (reset) {
			await store.clearToolDecisions(reset.lifetime);

			continue;
		}

		const tool = tools.find((candidate) => candidate.id === picked.toolId);

		if (tool) {
			await changeTool(store, tool);
		}
	}
}

function buildItems(store: PermissionStore, tools: ToolPermissionInfo[]): PermissionItem[] {
	const items: PermissionItem[] = [];

	let group: string | undefined;

	for (const tool of tools) {
		if (tool.group !== group) {
			group = tool.group;

			items.push({
				label: group,

				kind: vscode.QuickPickItemKind.Separator,
			});
		}

		const resolution = store.resolve(tool.id);

		items.push({
			label: tool.name,

			description: resolution
				? `${t(`policy.${resolution.policy}.short`)} · ${lifetimeLabel(resolution.lifetime).toLowerCase()}`
				: `${t(`policy.${tool.defaultPolicy}.short`)} · ${t('policy.default.short')}`,

			detail: tool.description,

			toolId: tool.id,
		});
	}

	const grants = store.listResourcePermissions();

	items.push({
		label: t('manage.groupResources'),

		kind: vscode.QuickPickItemKind.Separator,
	});

	for (const grant of grants) {
		items.push({
			label: grant.path,

			description: `${grant.toolId} · ${t(`resourceKind.${grant.kind}`)} · ${lifetimeLabel(
				grant.lifetime,
			).toLowerCase()}`,

			grant,
		});
	}

	items.push({
		label: t('manage.groupMaintenance'),

		kind: vscode.QuickPickItemKind.Separator,
	});

	items.push(
		...resetToolItems().map((item) => ({
			label: item.label,
		})),

		{
			label: t('manage.clearResourcesCurrent'),
		},

		{
			label: t('manage.clearResourcesAll'),
		},

		{
			label: t('manage.editProtected'),
		},
	);

	return items;
}

async function changeTool(store: PermissionStore, tool: ToolPermissionInfo): Promise<void> {
	const choice = await vscode.window.showQuickPick(
		[
			...(['allow', 'ask', 'deny'] as const).map((policy) => ({
				label: policyLabel(policy),

				policy,
			})),

			{
				label: t('policy.useDefault', {
					policy: t(`policy.${tool.defaultPolicy}.short`),
				}),

				policy: undefined,
			},
		],
		{
			title: tool.name,

			placeHolder: t('manage.toolPlaceholder'),
		},
	);

	if (!choice) {
		return;
	}

	const lifetimes = PERMISSION_LIFETIMES.filter(
		(lifetime) => choice.policy !== undefined || store.get(tool.id, lifetime) !== undefined,
	);

	if (lifetimes.length === 0) {
		return;
	}

	const pickedLifetime = await vscode.window.showQuickPick(
		lifetimes.map((lifetime) => ({
			label: lifetimeLabel(lifetime),

			lifetime,
		})),
		{
			title: choice.policy ? t('manage.keepFor') : t('manage.removeFor'),
		},
	);

	if (!pickedLifetime) {
		return;
	}

	if (choice.policy) {
		await store.set(tool.id, choice.policy, pickedLifetime.lifetime);
	} else {
		await store.clear(tool.id, pickedLifetime.lifetime);
	}
}
