import { describe, expect, it } from 'vitest';

import { hasCompletePeerId, shouldActivateMediaService, shouldStartClientCamera } from './videoMonitoring';

describe('videoMonitoring helpers', () => {
  it('treats only full peer ids as complete', () => {
    expect(hasCompletePeerId('ABCD')).toBe(true);
    expect(hasCompletePeerId('ABC')).toBe(false);
    expect(hasCompletePeerId('ABCDE')).toBe(false);
  });

  it('activates media service for masters even without a target id', () => {
    expect(shouldActivateMediaService('master', '')).toBe(true);
  });

  it('activates media service for clients once the master id is complete', () => {
    expect(shouldActivateMediaService('client', 'ABCD')).toBe(true);
    expect(shouldActivateMediaService('client', 'ABC')).toBe(false);
  });

  it('starts the client camera only for clients with a complete target id', () => {
    expect(shouldStartClientCamera('client', 'ABCD')).toBe(true);
    expect(shouldStartClientCamera('master', 'ABCD')).toBe(false);
    expect(shouldStartClientCamera('client', '')).toBe(false);
  });
});
