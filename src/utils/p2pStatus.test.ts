import { describe, it, expect } from 'vitest';
import { formatP2pStatus } from './p2pStatus';

describe('formatP2pStatus', () => {
  it('maps known statuses to Japanese', () => {
    expect(formatP2pStatus('READY: ID ABCD', 'ja')).toContain('ABCD');
    expect(formatP2pStatus('READY: ID ABCD', 'ja')).not.toContain('READY');
    expect(formatP2pStatus('RECONNECTING...', 'ja')).not.toContain('RECONNECTING');
    expect(formatP2pStatus('MASTER TIMEOUT', 'en')).toBe('MASTER TIMEOUT');
  });
  it('passes telemetry statuses through', () => {
    expect(formatP2pStatus('SYNCED (RTT 12ms / MIN 10ms)', 'ja')).toBe('SYNCED (RTT 12ms / MIN 10ms)');
    expect(formatP2pStatus('OK (HB)', 'en')).toBe('OK (HB)');
  });
  it('interpolates ids and error details', () => {
    expect(formatP2pStatus('CONNECTING TO WXYZ...', 'en')).toContain('WXYZ');
    expect(formatP2pStatus('ERROR: network-error', 'ja')).toContain('network-error');
  });
});
