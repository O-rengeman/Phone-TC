import { describe, expect, it } from 'vitest';

import { shouldUseMobileLayout } from './layout';

describe('shouldUseMobileLayout', () => {
  it('keeps common PC resolutions on the desktop dashboard', () => {
    expect(shouldUseMobileLayout({
      width: 1280,
      height: 720,
      hasTouchInput: false,
    })).toBe(false);
    expect(shouldUseMobileLayout({
      width: 1366,
      height: 768,
      hasTouchInput: false,
    })).toBe(false);
  });

  it('uses the compact layout for narrow windows regardless of input type', () => {
    expect(shouldUseMobileLayout({
      width: 768,
      height: 900,
      hasTouchInput: false,
    })).toBe(true);
  });

  it('recognizes a touch phone in landscape orientation', () => {
    expect(shouldUseMobileLayout({
      width: 932,
      height: 430,
      hasTouchInput: true,
    })).toBe(true);
  });

  it('does not classify a short non-touch PC window as a phone', () => {
    expect(shouldUseMobileLayout({
      width: 1024,
      height: 500,
      hasTouchInput: false,
    })).toBe(false);
  });
});
