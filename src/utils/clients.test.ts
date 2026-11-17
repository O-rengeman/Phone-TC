import { describe, it, expect } from 'vitest';
import { isClientOffline, isClientDrifting } from './clients';

describe('client predicates', () => {
  it('isClientOffline uses lastSeen vs now', () => {
    expect(isClientOffline({ lastSeen: 0 }, 30001)).toBe(true);
    expect(isClientOffline({ lastSeen: 0 }, 30000)).toBe(false);
  });
  it('isClientDrifting is sign-insensitive at 0.03s', () => {
    expect(isClientDrifting(0.03)).toBe(true);
    expect(isClientDrifting(-0.03)).toBe(true);
    expect(isClientDrifting(0.029)).toBe(false);
  });
});
