import { ToolParametersSchema } from '.';

// Returns a problem description, or undefined when the input satisfies the schema.
export function validateToolInput(schema: ToolParametersSchema, input: unknown): string | undefined {
  const values = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const problems: string[] = [];

  for (const key of schema.required ?? []) {
    const value = values[key];

    if (value === undefined || value === null || value === '') {
      problems.push(`missing required argument "${key}"`);
    }
  }

  for (const [key, definition] of Object.entries(schema.properties)) {
    const value = values[key];

    if (value !== undefined && value !== null && !matchesType(definition.type, value)) {
      problems.push(`argument "${key}" must be of type ${definition.type}`);
    }
  }

  return problems.length > 0 ? problems.join('; ') : undefined;
}

function matchesType(type: string | undefined, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value) || typeof value === 'string';
    case 'object':
      return typeof value === 'object';
    default:
      return true;
  }
}
