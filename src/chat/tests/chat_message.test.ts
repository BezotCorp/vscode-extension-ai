import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cloneChatMessage, closingText, createChatMessage } from '../chat_message';

describe('chat_message', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createChatMessage', () => {
    it('creates a message with the current time and no tool rounds', () => {
      const message = createChatMessage('user', 'Hello');

      expect(message).toEqual({ role: 'user', content: 'Hello', createdAt: '2026-11-19T10:00:00.000Z' });
      expect(message).not.toHaveProperty('toolRounds');
    });

    it('does not keep an empty list of tool rounds', () => {
      expect(createChatMessage('assistant', 'Hi', [])).not.toHaveProperty('toolRounds');
    });

    it('keeps tool rounds when there are some', () => {
      const rounds = [{ content: 'Working', calls: [{ name: 'read_file', arguments: {}, result: 'ok' }] }];

      expect(createChatMessage('assistant', 'Done', rounds).toolRounds).toEqual(rounds);
    });
  });

  describe('cloneChatMessage', () => {
    it('returns a distinct message with the same content', () => {
      const message = createChatMessage('user', 'Hello');
      const clone = cloneChatMessage(message);

      expect(clone).toEqual(message);
      expect(clone).not.toBe(message);
    });
  });

  describe('closingText', () => {
    it('returns the whole content when there are no tool rounds', () => {
      expect(closingText(createChatMessage('assistant', 'Answer'))).toBe('Answer');
    });

    it('returns only the closing answer after the text of the rounds', () => {
      const message = createChatMessage('assistant', 'Reading. Editing. Done.', [
        { content: 'Reading. ', calls: [] },
        { content: 'Editing. ', calls: [] },
      ]);

      expect(closingText(message)).toBe('Done.');
    });

    it('returns the whole content when it does not start with the text of the rounds', () => {
      const message = createChatMessage('assistant', 'Something else', [{ content: 'Reading. ', calls: [] }]);

      expect(closingText(message)).toBe('Something else');
    });

    it('returns the whole content when the rounds carry no text', () => {
      const message = createChatMessage('assistant', 'Answer', [{ content: '', calls: [] }]);

      expect(closingText(message)).toBe('Answer');
    });
  });
});
