import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnvironment } from '../base_environment';

const saved = { ...process.env };

describe('baseEnvironment', () => {
  beforeEach(() => {
    process.env.PATH = '/usr/bin';
    process.env.SECRET_TOKEN = 'must not leak';
    process.env.EXTRA_VARIABLE = 'extra';
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('passes the variables a program needs to run, and nothing else', () => {
    const environment = baseEnvironment();

    expect(environment.PATH).toBe('/usr/bin');
    expect(environment).not.toHaveProperty('SECRET_TOKEN');
    expect(environment).not.toHaveProperty('EXTRA_VARIABLE');
  });

  it('adds the variables a caller asks for', () => {
    expect(baseEnvironment(['EXTRA_VARIABLE']).EXTRA_VARIABLE).toBe('extra');
  });

  it('leaves out a variable that is not set', () => {
    delete process.env.TERM;

    expect(baseEnvironment()).not.toHaveProperty('TERM');
  });

  it('leaves out a value that looks like an exported shell function', () => {
    process.env.EXTRA_VARIABLE = '() { :; }; echo pwned';

    expect(baseEnvironment(['EXTRA_VARIABLE'])).not.toHaveProperty('EXTRA_VARIABLE');
  });
});
