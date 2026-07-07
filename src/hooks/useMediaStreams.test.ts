import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaStreams, usePeerStream, mediaStreamActions } from './useMediaStreams';

// mediaStreamActions operates on a module-level singleton store, so every
// test must start from a clean slate.
beforeEach(() => {
  mediaStreamActions.clearStreams();
});

function makeStream(): MediaStream {
  return {} as MediaStream;
}

describe('useMediaStreams', () => {
  it('starts with an empty map when the store is empty', () => {
    const { result } = renderHook(() => useMediaStreams());
    expect(result.current.size).toBe(0);
  });

  it('reflects addStream() with an updated map', () => {
    const { result } = renderHook(() => useMediaStreams());
    const stream = makeStream();

    act(() => mediaStreamActions.addStream('A', stream));

    expect(result.current.get('A')).toBe(stream);
  });

  it('reflects removeStream() by dropping the entry', () => {
    const { result } = renderHook(() => useMediaStreams());
    act(() => mediaStreamActions.addStream('A', makeStream()));

    act(() => mediaStreamActions.removeStream('A'));

    expect(result.current.has('A')).toBe(false);
  });

  it('removeStream() on a non-existent id is a no-op', () => {
    const { result } = renderHook(() => useMediaStreams());
    act(() => mediaStreamActions.addStream('A', makeStream()));

    act(() => mediaStreamActions.removeStream('DOES_NOT_EXIST'));

    expect(result.current.size).toBe(1);
  });

  it('reflects clearStreams() by emptying the map', () => {
    const { result } = renderHook(() => useMediaStreams());
    act(() => {
      mediaStreamActions.addStream('A', makeStream());
      mediaStreamActions.addStream('B', makeStream());
    });

    act(() => mediaStreamActions.clearStreams());

    expect(result.current.size).toBe(0);
  });

  it('does not leak listeners across mount/unmount — a second mount still updates correctly', () => {
    const first = renderHook(() => useMediaStreams());
    first.unmount();

    const second = renderHook(() => useMediaStreams());
    act(() => mediaStreamActions.addStream('A', makeStream()));

    expect(second.result.current.has('A')).toBe(true);
  });
});

describe('useMediaStreams.mediaStreamActions direct reads', () => {
  it('getStream returns null for an unknown peerId', () => {
    expect(mediaStreamActions.getStream('UNKNOWN')).toBeNull();
  });

  it('getAllStreams returns a snapshot copy, not a live reference to the internal store', () => {
    mediaStreamActions.addStream('A', makeStream());
    const snapshot = mediaStreamActions.getAllStreams();

    mediaStreamActions.addStream('B', makeStream());

    expect(snapshot.has('B')).toBe(false);
  });
});

describe('usePeerStream', () => {
  it('returns null initially when no stream exists for the given peerId', () => {
    const { result } = renderHook(() => usePeerStream('A'));
    expect(result.current).toBeNull();
  });

  it('updates when addStream() is called for its peerId after mount', () => {
    const { result } = renderHook(() => usePeerStream('A'));
    const stream = makeStream();

    act(() => mediaStreamActions.addStream('A', stream));

    expect(result.current).toBe(stream);
  });

  it('stays correct (unaffected) when a different peerId is updated', () => {
    const { result } = renderHook(() => usePeerStream('A'));

    act(() => mediaStreamActions.addStream('B', makeStream()));

    expect(result.current).toBeNull();
  });

  it('returns null and stays null when peerId is null', () => {
    const { result } = renderHook(() => usePeerStream(null));

    act(() => mediaStreamActions.addStream('A', makeStream()));

    expect(result.current).toBeNull();
  });

  it('switches to the new peerId\'s stream when the peerId argument changes', () => {
    const streamA = makeStream();
    const streamB = makeStream();
    mediaStreamActions.addStream('A', streamA);
    mediaStreamActions.addStream('B', streamB);

    const { result, rerender } = renderHook(({ peerId }: { peerId: string }) => usePeerStream(peerId), {
      initialProps: { peerId: 'A' },
    });
    expect(result.current).toBe(streamA);

    rerender({ peerId: 'B' });
    expect(result.current).toBe(streamB);
  });
});
