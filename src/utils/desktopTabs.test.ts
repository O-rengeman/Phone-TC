import { describe, it, expect } from 'vitest';
import {
  DESKTOP_TABS,
  DEFAULT_DESKTOP_TAB,
  visibleDesktopTabs,
  isDesktopTabId,
  resolveDesktopTab,
  desktopTabForHotkey,
} from './desktopTabs';

describe('visibleDesktopTabs', () => {
  it('gives the host every tab', () => {
    expect(visibleDesktopTabs(true)).toHaveLength(DESKTOP_TABS.length);
  });

  it('gives a client every tab too, since none are host-only', () => {
    const ids = visibleDesktopTabs(false).map(tab => tab.id);
    expect(ids).toEqual(['timecode', 'sync', 'markers', 'activity']);
  });

  it('keeps the declared order', () => {
    expect(visibleDesktopTabs(true).map(tab => tab.id))
      .toEqual(['timecode', 'sync', 'markers', 'activity']);
  });

  it('assigns every tab a unique hotkey', () => {
    const hotkeys = DESKTOP_TABS.map(tab => tab.hotkey);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
  });
});

describe('isDesktopTabId', () => {
  it('accepts known ids', () => {
    expect(isDesktopTabId('markers')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isDesktopTabId('nope')).toBe(false);
    expect(isDesktopTabId(null)).toBe(false);
    expect(isDesktopTabId(3)).toBe(false);
    expect(isDesktopTabId(undefined)).toBe(false);
  });
});

describe('resolveDesktopTab', () => {
  it('keeps a valid stored tab', () => {
    expect(resolveDesktopTab('markers', false)).toBe('markers');
  });

  it('falls back to the default for unknown or missing values', () => {
    expect(resolveDesktopTab(null, true)).toBe(DEFAULT_DESKTOP_TAB);
    expect(resolveDesktopTab('garbage', true)).toBe(DEFAULT_DESKTOP_TAB);
  });
});

describe('desktopTabForHotkey', () => {
  it('maps a digit to its tab', () => {
    expect(desktopTabForHotkey({ key: '1', code: 'Digit1' }, false)).toBe('timecode');
    expect(desktopTabForHotkey({ key: '3', code: 'Digit3' }, false)).toBe('markers');
    expect(desktopTabForHotkey({ key: '4', code: 'Digit4' }, false)).toBe('activity');
  });

  it('still matches on macOS, where Option+digit rewrites key into symbols', () => {
    // Option+1/2/3 produce '¡'/'™'/'£' on US macOS layouts, but code stays put.
    expect(desktopTabForHotkey({ key: '¡', code: 'Digit1' }, true)).toBe('timecode');
    expect(desktopTabForHotkey({ key: '™', code: 'Digit2' }, true)).toBe('sync');
    expect(desktopTabForHotkey({ key: '£', code: 'Digit3' }, false)).toBe('markers');
  });

  it('falls back to key for digits that do not come from the top row', () => {
    expect(desktopTabForHotkey({ key: '2', code: 'Numpad2' }, false)).toBe('sync');

  });

  it('returns null for a digit that addresses no tab', () => {
    expect(desktopTabForHotkey({ key: '9', code: 'Digit9' }, true)).toBeNull();
    expect(desktopTabForHotkey({ key: '€', code: 'Digit5' }, true)).toBeNull();
    expect(desktopTabForHotkey({ key: '', code: '' }, true)).toBeNull();
  });
});
