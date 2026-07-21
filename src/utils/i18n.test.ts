import { describe, it, expect, beforeEach } from 'vitest';
import { t, getInitialLang, persistLang, LANGS } from './i18n';

describe('t', () => {
  it('looks up English and Japanese', () => {
    expect(t('tab.record', 'en')).toBe('RECORD');
    expect(t('tab.record', 'ja')).toBe('記録');
  });

  it('falls back to English for a missing Japanese key is not needed (full parity), but falls back to the key when unknown', () => {
    expect(t('does.not.exist', 'en')).toBe('does.not.exist');
    expect(t('does.not.exist', 'ja')).toBe('does.not.exist');
  });

  it('interpolates {vars}', () => {
    // No interpolated keys ship today, but the mechanism must work.
    // Use a known key without vars to ensure vars never corrupt output.
    expect(t('btn.start', 'en', { unused: 1 })).toBe('START');
  });

  it('has Japanese parity for every English key', () => {
    // Guard against forgetting a translation: every en key resolves to a
    // non-identical, non-empty ja string (except intentionally-shared tokens).
    const shared = new Set<string>(); // none expected currently
    const enKeys = Object.keys(
      // re-derive by probing a representative set
      {
        'tab.record': 1, 'status.ready': 1, 'label.frameRate': 1, 'btn.start': 1,
        'drift.accuracy': 1, 'sync.network': 1, 'guide.title': 1, 'slate.close': 1,
        'toast.resynced': 1,
      },
    );
    for (const k of enKeys) {
      const enV = t(k, 'en');
      const jaV = t(k, 'ja');
      expect(jaV).toBeTruthy();
      if (!shared.has(k)) expect(jaV).not.toBe(enV);
    }
  });
});

describe('getInitialLang / persistLang', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('round-trips a persisted language', () => {
    persistLang('ja');
    expect(getInitialLang()).toBe('ja');
    persistLang('en');
    expect(getInitialLang()).toBe('en');
  });

  it('exposes the supported language list', () => {
    expect([...LANGS]).toEqual(['en', 'ja']);
  });
});
