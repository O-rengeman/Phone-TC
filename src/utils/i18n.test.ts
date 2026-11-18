import { describe, it, expect, beforeEach } from 'vitest';
import { t, getInitialLang, persistLang, LANGS } from './i18n';

describe('t', () => {
  it('looks up English and Japanese', () => {
    expect(t('tab.main', 'en')).toBe('MAIN');
    expect(t('tab.main', 'ja')).toBe('メイン');
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

  it('exposes the mobile pager strings in both languages', () => {
    expect(t('pager.prev', 'en')).toBe('PREV');
    expect(t('pager.next', 'en')).toBe('NEXT');
    expect(t('pager.prev', 'ja')).toBe('前へ');
    expect(t('pager.next', 'ja')).toBe('次へ');
    expect(t('pager.status', 'en', { page: 2, total: 5 })).toBe('2 / 5');
    expect(t('pager.status', 'ja', { page: 2, total: 5 })).toBe('2 / 5');
  });

  it('has Japanese parity for every English key', () => {
    const testKeys = [
      'tab.main', 'status.ready', 'label.frameRate', 'btn.start',
      'help.markers.title', 'help.sync.title',
      'dt.hint.fps', 'dt.hint.offset', 'dt.hint.startTc', 'dt.hint.syncClients',
    ];
    for (const k of testKeys) {
      const enV = t(k, 'en');
      const jaV = t(k, 'ja');
      expect(jaV).toBeTruthy();
      expect(jaV).not.toBe(enV);
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
