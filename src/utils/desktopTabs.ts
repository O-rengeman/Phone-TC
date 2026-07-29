// Tab model for the desktop console.
//
// Kept as pure data + pure functions (no React) so the rules that decide which
// tabs exist and which one is selected are unit-testable on their own, and so
// the shell component stays a layout concern rather than a policy one.

export type DesktopTabId = 'timecode' | 'sync' | 'switcher' | 'tally' | 'obs' | 'markers';

export interface DesktopTabDef {
  id: DesktopTabId;
  /** i18n key for the tab label. */
  labelKey: string;
  /** Single-character index shown as the keyboard hint (Alt+N). */
  hotkey: string;
  /** Only meaningful when this device is the session master. */
  hostOnly?: boolean;
}

export const DESKTOP_TABS: readonly DesktopTabDef[] = [
  { id: 'timecode', labelKey: 'dtab.timecode', hotkey: '1' },
  { id: 'sync', labelKey: 'dtab.sync', hotkey: '2' },
  { id: 'switcher', labelKey: 'dtab.switcher', hotkey: '3', hostOnly: true },
  { id: 'tally', labelKey: 'dtab.tally', hotkey: '4' },
  { id: 'obs', labelKey: 'dtab.obs', hotkey: '5', hostOnly: true },
  { id: 'markers', labelKey: 'dtab.markers', hotkey: '6' },
];

export const DEFAULT_DESKTOP_TAB: DesktopTabId = 'timecode';

/** localStorage key holding the last selected desktop tab. */
export const DESKTOP_TAB_STORAGE_KEY = 'ltc-desktop-tab';

/**
 * The tabs available to this device. The switcher belongs to whoever is
 * running the session; showing it to a camera operator would offer controls
 * that silently do nothing.
 */
export function visibleDesktopTabs(isHost: boolean): DesktopTabDef[] {
  return DESKTOP_TABS.filter(tab => !tab.hostOnly || isHost);
}

export function isDesktopTabId(value: unknown): value is DesktopTabId {
  return typeof value === 'string' && DESKTOP_TABS.some(tab => tab.id === value);
}

/**
 * Resolves the tab to actually display.
 *
 * Handles both the restored-from-storage case and the mid-session case where
 * the device stops being host while sitting on the switcher tab — landing on
 * a tab that no longer exists would render an empty console, so it falls back
 * to the default rather than showing nothing.
 */
export function resolveDesktopTab(requested: unknown, isHost: boolean): DesktopTabId {
  if (!isDesktopTabId(requested)) return DEFAULT_DESKTOP_TAB;
  const available = visibleDesktopTabs(isHost);
  return available.some(tab => tab.id === requested) ? requested : DEFAULT_DESKTOP_TAB;
}

/**
 * Maps an Alt+<digit> shortcut to a tab, so an operator can move between
 * sections without letting go of whatever else they are doing. Returns null
 * when the digit doesn't address a tab this device can show.
 */
export function desktopTabForHotkey(key: string, isHost: boolean): DesktopTabId | null {
  const match = visibleDesktopTabs(isHost).find(tab => tab.hotkey === key);
  return match ? match.id : null;
}
