import { describe, it, expect, beforeEach } from 'vitest';
import { logActivity, clearActivityLog, getActivityEntries } from './activityLog';

// The store is module-level; clear between tests for isolation.
beforeEach(() => clearActivityLog());

describe('activityLog', () => {
  it('records entries newest-first with kind, vars and timestamp', () => {
    logActivity('transportStart');
    logActivity('marker', { tc: '01:00:00:00', color: 'Red' });
    const entries = getActivityEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe('marker');
    expect(entries[0].vars).toEqual({ tc: '01:00:00:00', color: 'Red' });
    expect(entries[1].kind).toBe('transportStart');
    expect(entries[0].at).toBeGreaterThan(0);
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it('clearActivityLog empties the store', () => {
    logActivity('transportStop');
    clearActivityLog();
    expect(getActivityEntries()).toHaveLength(0);
  });

  it('caps the log at the maximum length, dropping oldest', () => {
    for (let i = 0; i < 210; i++) logActivity('syncMode', { mode: `M${i}` });
    const entries = getActivityEntries();
    expect(entries).toHaveLength(200);
    expect(entries[0].vars?.mode).toBe('M209');
    expect(entries[199].vars?.mode).toBe('M10');
  });
});
