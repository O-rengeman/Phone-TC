import { describe, expect, it } from 'vitest';
import { getAutoSwitcherAssignment, resolveReturnFeed } from './switcherRouting';

describe('resolveReturnFeed', () => {
  it('prefers the target id stream when available', () => {
    const targetStream = {} as MediaStream;
    const fallbackStream = {} as MediaStream;
    const streams = new Map([
      ['MASTER', targetStream],
      ['OTHER', fallbackStream],
    ]);

    expect(resolveReturnFeed('MASTER', streams)).toEqual({
      peerId: 'MASTER',
      stream: targetStream,
    });
  });

  it('falls back to the first available stream when target id is missing', () => {
    const fallbackStream = {} as MediaStream;
    const streams = new Map([
      ['OTHER', fallbackStream],
    ]);

    expect(resolveReturnFeed('MASTER', streams)).toEqual({
      peerId: 'OTHER',
      stream: fallbackStream,
    });
  });

  it('returns null when no streams exist', () => {
    expect(resolveReturnFeed('MASTER', new Map())).toEqual({
      peerId: null,
      stream: null,
    });
  });
});

describe('getAutoSwitcherAssignment', () => {
  it('uses the first input as program and the second as preview when nothing is selected', () => {
    expect(getAutoSwitcherAssignment(['A', 'B', 'C'], null, null)).toEqual({
      programId: 'A',
      previewId: 'B',
    });
  });

  it('promotes the current preview when the current program disappears', () => {
    expect(getAutoSwitcherAssignment(['B', 'C'], 'A', 'B')).toEqual({
      programId: 'B',
      previewId: 'C',
    });
  });

  it('clears preview when only one valid input remains', () => {
    expect(getAutoSwitcherAssignment(['A'], 'A', 'B')).toEqual({
      programId: 'A',
      previewId: null,
    });
  });

  it('clears both selections when no inputs remain', () => {
    expect(getAutoSwitcherAssignment([], 'A', 'B')).toEqual({
      programId: null,
      previewId: null,
    });
  });
});
