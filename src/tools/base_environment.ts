import { BASE_ENVIRONMENT } from './base_environment_variables';

export function baseEnvironment(additional: string[] = []): Record<string, string> {
	const environment: Record<string, string> = {};

	for (const name of [...BASE_ENVIRONMENT, ...additional]) {
		const value = process.env[name];

		if (value !== undefined && !value.startsWith('()')) {
			environment[name] = value;
		}
	}

	return environment;
}
