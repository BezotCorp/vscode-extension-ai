import { describe, expect, it } from 'vitest';

import { contentEffect, networkEffect, removalEffect } from '../permission_effects';

describe('permission effects', () => {
  it('gives each kind of effect its own key, so a refusal covers only equivalent operations', () => {
    expect(contentEffect('/a')).toBe('content:/a');
    expect(removalEffect('/a')).toBe('removal:/a');
    expect(networkEffect('example.com')).toBe('net:example.com');
    expect(new Set([contentEffect('/a'), removalEffect('/a')]).size).toBe(2);
  });
});
