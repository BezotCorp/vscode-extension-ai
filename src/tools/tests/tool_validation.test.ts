import { describe, expect, it } from 'vitest';

import type { ToolParametersSchema } from '../tool_parameters_schema';
import { validateToolInput } from '../tool_validation';

const schema: ToolParametersSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    line: { type: 'number' },
    flag: { type: 'boolean' },
    files: { type: 'array' },
    options: { type: 'object' },
    any: {},
  },
  required: ['path'],
};

describe('validateToolInput', () => {
  it('accepts input that satisfies the schema', () => {
    expect(validateToolInput(schema, { path: 'a.ts', line: 3, flag: true, files: [], options: {} })).toBeUndefined();
  });

  it('reports a missing, null or empty required argument', () => {
    expect(validateToolInput(schema, {})).toBe('missing required argument "path"');
    expect(validateToolInput(schema, { path: null })).toBe('missing required argument "path"');
    expect(validateToolInput(schema, { path: '' })).toBe('missing required argument "path"');
  });

  it('accepts an empty string when the parameter allows it', () => {
    const permissive: ToolParametersSchema = {
      type: 'object',
      properties: { text: { type: 'string', minLength: 0 } },
      required: ['text'],
    };

    expect(validateToolInput(permissive, { text: '' })).toBeUndefined();
  });

  it('reports a wrong type', () => {
    expect(validateToolInput(schema, { path: 3 })).toBe('argument "path" must be of type string');
    expect(validateToolInput(schema, { path: 'a', flag: 'yes' })).toBe('argument "flag" must be of type boolean');
  });

  it('accepts a number given as a numeric string, not a blank or non-numeric one', () => {
    expect(validateToolInput(schema, { path: 'a', line: '12' })).toBeUndefined();
    expect(validateToolInput(schema, { path: 'a', line: ' ' })).toBe('argument "line" must be of type number');
    expect(validateToolInput(schema, { path: 'a', line: 'abc' })).toBe('argument "line" must be of type number');
  });

  it('accepts an array given as a string, for the model that serializes it', () => {
    expect(validateToolInput(schema, { path: 'a', files: '[1]' })).toBeUndefined();
    expect(validateToolInput(schema, { path: 'a', files: 4 })).toBe('argument "files" must be of type array');
  });

  it('joins several problems', () => {
    expect(validateToolInput(schema, { line: 'x' })).toBe(
      'missing required argument "path"; argument "line" must be of type number',
    );
  });

  it('treats a missing or non-object input as empty', () => {
    expect(validateToolInput(schema, undefined)).toBe('missing required argument "path"');
    expect(validateToolInput(schema, null)).toBe('missing required argument "path"');
  });

  it('does not check a parameter without a type', () => {
    expect(validateToolInput(schema, { path: 'a', any: { x: 1 } })).toBeUndefined();
  });
});
