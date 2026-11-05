export class ToolsUnsupportedError extends Error {
	constructor() {
		super('The model does not support tools.');
	}
}
