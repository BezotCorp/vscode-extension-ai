import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../../chat/chat_message';
import { displayContent, sendToolCall, sendToolNotice, sendToolResult } from '../tool_call_presenter';
import { MAX_ARGUMENT_CHARS } from '../tool_call_presenter_limits';

const view = () => ({ webview: { postMessage: vi.fn() } });
const posted = (webview: ReturnType<typeof view>) => webview.webview.postMessage.mock.calls.map((call) => call[0]);
const message = (content: string, toolRounds?: ChatMessage['toolRounds']): ChatMessage => ({
  role: 'assistant',
  content,
  createdAt: '2026-11-19T10:00:00.000Z',
  toolRounds,
});

describe('tool call presenter', () => {
  describe('what is streamed while a message is generated', () => {
    it('shows a tool call with its name and arguments', () => {
      const webview = view();

      sendToolCall(webview as never, 's1', { name: 'read_file', arguments: { path: 'a.ts' } });

      expect(posted(webview)).toEqual([
        { type: 'responseChunk', sessionId: 's1', text: '\n[tool] read_file {"path":"a.ts"}\n' },
      ]);
    });

    it('shows a call without arguments as an empty object, and cuts very long arguments', () => {
      const webview = view();

      sendToolCall(webview as never, 's1', { name: 'git_status', arguments: undefined });
      sendToolCall(webview as never, 's1', { name: 'x', arguments: { text: 'y'.repeat(500) } });

      const [first, second] = posted(webview);

      expect(first.text).toBe('\n[tool] git_status {}\n');
      expect(second.text).toBe(
        `\n[tool] x ${JSON.stringify({ text: 'y'.repeat(500) }).slice(0, MAX_ARGUMENT_CHARS)}...\n`,
      );
    });

    it('shows the outcome of a tool, with its reason when there is one', () => {
      const webview = view();

      sendToolResult(webview as never, 's1', { status: 'success', operation: 'x', executed: true, retryable: false });
      sendToolResult(webview as never, 's1', {
        status: 'denied',
        operation: 'x',
        executed: false,
        retryable: false,
        reason: 'user_refused',
      });

      expect(posted(webview).map((entry) => entry.text)).toEqual([
        '[tool] -> success\n\n',
        '[tool] -> denied (user_refused)\n\n',
      ]);
    });

    it('relays a notice as text of the answer', () => {
      const webview = view();

      sendToolNotice(webview as never, 's1', 'notice');

      expect(posted(webview)).toEqual([{ type: 'responseChunk', sessionId: 's1', text: 'notice' }]);
    });
  });

  describe('displayContent', () => {
    it('shows a message without tool rounds as it was written', () => {
      expect(displayContent(message('plain answer'))).toBe('plain answer');
      expect(displayContent(message('plain answer', []))).toBe('plain answer');
    });

    it('rebuilds the lines that were streamed, round by round, then the closing answer', () => {
      const shown = displayContent(
        message('Looking. Done.', [
          {
            content: 'Looking. ',
            calls: [
              { name: 'read_file', arguments: { path: 'a' }, result: '{"status":"success","operation":"read_file"}' },
              { name: 'update_file', arguments: {}, result: '{"status":"error","reason":"file_changed"}' },
            ],
          },
        ]),
      );

      expect(shown).toBe(
        'Looking. \n[tool] read_file {"path":"a"}\n[tool] -> success\n\n' +
          '\n[tool] update_file {}\n[tool] -> error (file_changed)\n\nDone.',
      );
    });

    it('reads the outcome from the start of a result that was cut, without parsing it', () => {
      const shown = displayContent(
        message('', [
          { name: 'x', content: '', calls: [] },
          {
            content: '',
            calls: [
              { name: 'read_file', arguments: {}, result: `{"status":"success","content":"${'z'.repeat(5_000)}` },
            ],
          },
        ] as never),
      );

      expect(shown).toContain('[tool] -> success');
    });

    it('says the outcome is unknown when the result has none', () => {
      expect(
        displayContent(message('', [{ content: '', calls: [{ name: 'x', arguments: {}, result: 'garbage' }] }])),
      ).toContain('[tool] -> unknown');
    });

    it('does not show an outcome found beyond the start of the result', () => {
      const result = `${' '.repeat(700)}{"status":"success"}`;

      expect(displayContent(message('', [{ content: '', calls: [{ name: 'x', arguments: {}, result }] }]))).toContain(
        '[tool] -> unknown',
      );
    });

    it('is not affected by the file observations a call carries', () => {
      const observations = [{ path: '/a', sha: 'a'.repeat(64), complete: true, origin: 'read' as const }];
      const withObservations = message('', [
        { content: '', calls: [{ name: 'read_file', arguments: {}, result: '{"status":"success"}', observations }] },
      ]);
      const without = message('', [
        { content: '', calls: [{ name: 'read_file', arguments: {}, result: '{"status":"success"}' }] },
      ]);

      expect(displayContent(withObservations)).toBe(displayContent(without));
    });
  });
});
