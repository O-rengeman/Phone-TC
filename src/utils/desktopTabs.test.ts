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

  it('hides the switcher from a device that is not running the session', () => {
    const ids = visibleDesktopTabs(false).map(tab => tab.id);
    expect(ids).not.toContain('switcher');
    expect(ids).toContain('timecode');
    expect(ids).toContain('tally');
  });

  it('keeps the declared order', () => {
    expect(visibleDesktopTabs(true).map(tab => tab.id))
      .toEqual(['timecode', 'sync', 'switcher', 'tally', 'markers']);
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
    expect(resolveDesktopTab('tally', false)).toBe('tally');
  });

  it('falls back to the default for unknown or missing values', () => {
    expect(resolveDesktopTab(null, true)).toBe(DEFAULT_DESKTOP_TAB);
    expect(resolveDesktopTab('garbage', true)).toBe(DEFAULT_DESKTOP_TAB);
  });

  it('lets the host stay on the switcher', () => {
    expect(resolveDesktopTab('switcher', true)).toBe('switcher');
  });

  it('moves off the switcher when this device is no longer the host', () => {
    // Otherwise a client demoted mid-session would be left staring at a tab
    // that renders nothing.
    expect(resolveDesktopTab('switcher', false)).toBe(DEFAULT_DESKTOP_TAB);
  });
});

describe('desktopTabForHotkey', () => {
  it('maps a digit to its tab', () => {
    expect(desktopTabForHotkey('1', false)).toBe('timecode');
    expect(desktopTabForHotkey('5', false)).toBe('markers');
  });

  it('maps the switcher digit only for the host', () => {
    expect(desktopTabForHotkey('3', true)).toBe('switcher');
    expect(desktopTabForHotkey('3', false)).toBeNull();
  });

  it('returns null for a digit that addresses no tab', () => {
    expect(desktopTabForHotkey('9', true)).toBeNull();
    expect(desktopTabForHotkey('', true)).toBeNull();
  });
});
