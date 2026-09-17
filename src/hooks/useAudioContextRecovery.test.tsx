import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioContextRecovery } from './useAudioContextRecovery';

type FakeCtx = { state: AudioContextState; resume: ReturnType<typeof vi.fn> };

function makeCtx(state: AudioContextState): FakeCtx {
  return { state, resume: vi.fn().mockResolvedValue(undefined) };
}

function ref(ctx: FakeCtx | null) {
  return { current: ctx as unknown as AudioContext | null };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useAudioContextRecovery', () => {
  it('resumes a suspended context when the app becomes visible', () => {
    const ctx = makeCtx('suspended');
    renderHook(() => useAudioContextRecovery(ref(ctx), true));

    act(() => setVisibility('visible'));

    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('resumes a suspended context on window focus', () => {
    const ctx = makeCtx('suspended');
    renderHook(() => useAudioContextRecovery(ref(ctx), true));

    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('leaves a running context alone', () => {
    const ctx = makeCtx('running');
    renderHook(() => useAudioContextRecovery(ref(ctx), true));

    act(() => setVisibility('visible'));

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('does nothing while the app is being hidden', () => {
    const ctx = makeCtx('suspended');
    renderHook(() => useAudioContextRecovery(ref(ctx), true));

    act(() => setVisibility('hidden'));

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('does not touch audio when playback is not running', () => {
    const ctx = makeCtx('suspended');
    renderHook(() => useAudioContextRecovery(ref(ctx), false));

    act(() => setVisibility('visible'));
    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('tolerates a context that has not been created yet', () => {
    renderHook(() => useAudioContextRecovery(ref(null), true));
    expect(() => act(() => setVisibility('visible'))).not.toThrow();
  });

  it('warns instead of throwing when resume rejects', async () => {
    const ctx = makeCtx('suspended');
    ctx.resume.mockRejectedValue(new Error('not allowed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useAudioContextRecovery(ref(ctx), true));

    act(() => setVisibility('visible'));
    await act(async () => { await Promise.resolve(); });

    expect(warnSpy).toHaveBeenCalledWith('AudioContext resume on foreground failed', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('stops listening after unmount', () => {
    const ctx = makeCtx('suspended');
    const { unmount } = renderHook(() => useAudioContextRecovery(ref(ctx), true));

    unmount();
    act(() => setVisibility('visible'));
    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(ctx.resume).not.toHaveBeenCalled();
  });
});
