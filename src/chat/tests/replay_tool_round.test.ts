import { describe, expect, it } from 'vitest';

import { MAX_REPLAYED_RESULT_CHARACTERS } from '../chat_history_limits';
import { replayToolRound } from '../replay_tool_round';

const SHA = 'd'.repeat(64);

describe('replayToolRound', () => {
  it('cuts a long result for the request without touching the stored round', () => {
    const stored = {
      content: 'working',
      calls: [{ name: 'read_file', arguments: { path: 'a' }, result: 'x'.repeat(MAX_REPLAYED_RESULT_CHARACTERS + 50) }],
    };
    const replayed = replayToolRound(stored);

    expect(replayed.calls[0]?.result.length).toBeLessThan(stored.calls[0]?.result.length ?? 0);
    expect(replayed.calls[0]?.result).toContain('result cut in history');
    expect(stored.calls[0]?.result).toHaveLength(MAX_REPLAYED_RESULT_CHARACTERS + 50);
  });

  it('keeps a short result as it is', () => {
    const replayed = replayToolRound({ content: '', calls: [{ name: 't', arguments: {}, result: 'ok' }] });

    expect(replayed.calls[0]?.result).toBe('ok');
  });

  it('leaves the file observations out of what is replayed', () => {
    const replayed = replayToolRound({
      content: '',
      calls: [
        {
          name: 'read_file',
          arguments: {},
          result: 'ok',
          observations: [{ path: 'a', sha: SHA, complete: true, origin: 'read' }],
        },
      ],
    });

    expect(replayed.calls[0]).not.toHaveProperty('observations');
  });
});
