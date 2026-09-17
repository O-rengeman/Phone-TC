import { describe, it, expect } from 'vitest';
import {
  HELP_TOPIC_IDS,
  HELP_TOPICS,
  helpKeys,
  helpStepKeys,
  helpTipKeys,
  parseHelpText,
} from './helpTopics';
import { LANGS, t } from './i18n';

describe('parseHelpText', () => {
  it('returns plain text as a single segment', () => {
    expect(parseHelpText('Open the tab.')).toEqual([{ kind: 'text', text: 'Open the tab.' }]);
  });

  it('pulls out a control name', () => {
    expect(parseHelpText('Press [[TAKE]] to cut.')).toEqual([
      { kind: 'text', text: 'Press ' },
      { kind: 'control', text: 'TAKE' },
      { kind: 'text', text: ' to cut.' },
    ]);
  });

  it('handles several controls in one step', () => {
    expect(parseHelpText('[[R]] / [[B]]')).toEqual([
      { kind: 'control', text: 'R' },
      { kind: 'text', text: ' / ' },
      { kind: 'control', text: 'B' },
    ]);
  });

  it('handles a step that is only a control', () => {
    expect(parseHelpText('[[START]]')).toEqual([{ kind: 'control', text: 'START' }]);
  });

  it('leaves an unclosed marker alone rather than swallowing the rest', () => {
    expect(parseHelpText('Press [[TAKE')).toEqual([{ kind: 'text', text: 'Press [[TAKE' }]);
  });

  it('returns nothing for empty text', () => {
    expect(parseHelpText('')).toEqual([]);
  });
});

describe('help key generation', () => {
  it('derives one key per declared step and tip', () => {
    expect(helpStepKeys('obs')).toHaveLength(HELP_TOPICS.obs.steps);
    expect(helpStepKeys('obs')[0]).toBe('help.obs.s1');
    expect(helpTipKeys('obs')).toHaveLength(HELP_TOPICS.obs.tips);
    expect(helpTipKeys('obs')[0]).toBe('help.obs.tip1');
  });
});

describe('help content', () => {
  // t() falls back to the key itself when a string is missing, so a key that
  // translates to itself is a topic that would ship as raw "help.obs.s4" on a
  // phone. Catching that here is the whole reason the registry is data.
  it.each(HELP_TOPIC_IDS)('has every string translated in every language: %s', id => {
    for (const lang of LANGS) {
      for (const key of helpKeys(id)) {
        expect(t(key, lang), `${key} (${lang})`).not.toBe(key);
      }
    }
  });

  it.each(HELP_TOPIC_IDS)('names at least one on-screen control per topic: %s', id => {
    const controls = helpStepKeys(id)
      .flatMap(key => parseHelpText(t(key, 'ja')))
      .filter(segment => segment.kind === 'control');
    expect(controls.length).toBeGreaterThan(0);
  });

  it.each(HELP_TOPIC_IDS)('leaves no unclosed control marker: %s', id => {
    for (const lang of LANGS) {
      for (const key of helpKeys(id)) {
        const text = t(key, lang);
        const opens = (text.match(/\[\[/g) ?? []).length;
        const closes = (text.match(/\]\]/g) ?? []).length;
        expect(opens, `${key} (${lang})`).toBe(closes);
      }
    }
  });
});
