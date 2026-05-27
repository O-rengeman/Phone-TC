import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeSync } from './TimeSync';

// Must match the private constant inside TimeSync.ts
const NTP_CACHE_KEY = 'ltc-ntp-cache';

// Build a fetch mock that responds with a valid time-server payload.
function stubFetchSuccess(serverTime: string = new Date().toISOString()) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ dateTime: serverTime }),
  }));
}

function stubFetchFail() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TimeSync', () => {
  it('fetches a server time, returns a result, and persists cache', async () => {
    stubFetchSuccess();

    const result = await TimeSync.sync(1);

    expect(typeof result.offset).toBe('number');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.fromCache).toBeUndefined();

    const raw = localStorage.getItem(NTP_CACHE_KEY);
    expect(raw).not.toBeNull();
    const cached = JSON.parse(raw!);
    expect(cached.offset).toBe(result.offset);
    expect(typeof cached.savedAt).toBe('number');
  });

  it('returns fromCache:true when all servers fail but cache is fresh', async () => {
    localStorage.setItem(NTP_CACHE_KEY, JSON.stringify({
      offset: 100,
      latency: 50,
      savedAt: Date.now(),
    }));
    stubFetchFail();

    const result = await TimeSync.sync(1);

    expect(result.fromCache).toBe(true);
    expect(result.offset).toBe(100);
    expect(result.latency).toBe(50);
  });

  it('throws when all servers fail and cache has expired', async () => {
    // TTL is 1 hour; set savedAt to 2 hours in the past so cache is stale.
    localStorage.setItem(NTP_CACHE_KEY, JSON.stringify({
      offset: 100,
      latency: 50,
      savedAt: Date.now() - 2 * 3600_000,
    }));
    stubFetchFail();

    await expect(TimeSync.sync(1)).rejects.toThrow('All time servers failed');
  });

  it('catches malformed localStorage JSON silently and rethrows server error', async () => {
    // JSON.parse will throw inside loadCache; the catch block returns null,
    // so the outer error ("All time servers failed") propagates instead.
    localStorage.setItem(NTP_CACHE_KEY, '{not valid json{');
    stubFetchFail();

    await expect(TimeSync.sync(1)).rejects.toThrow('All time servers failed');
  });
});
