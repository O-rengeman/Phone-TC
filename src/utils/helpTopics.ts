/**
 * helpTopics.ts — the "how do I use this?" registry, one topic per feature.
 *
 * Kept as data plus a tiny parser rather than JSX so the step text lives in
 * the translation tables with everything else, and so the rule that every
 * topic has a full set of translated steps can be asserted in a unit test
 * instead of being noticed on set.
 */

export type HelpTopicId = 'timecode' | 'sync' | 'switcher' | 'tally' | 'obs' | 'markers';

export interface HelpTopic {
  id: HelpTopicId;
  /** How many numbered steps this topic has; keys are derived from it. */
  steps: number;
  /** How many closing tips follow the steps. */
  tips: number;
}

export const HELP_TOPICS: Record<HelpTopicId, HelpTopic> = {
  timecode: { id: 'timecode', steps: 8, tips: 2 },
  sync: { id: 'sync', steps: 6, tips: 2 },
  switcher: { id: 'switcher', steps: 6, tips: 2 },
  tally: { id: 'tally', steps: 7, tips: 2 },
  obs: { id: 'obs', steps: 7, tips: 2 },
  markers: { id: 'markers', steps: 6, tips: 2 },
};

export const HELP_TOPIC_IDS = Object.keys(HELP_TOPICS) as HelpTopicId[];

export function helpTitleKey(id: HelpTopicId): string {
  return `help.${id}.title`;
}

export function helpSummaryKey(id: HelpTopicId): string {
  return `help.${id}.summary`;
}

export function helpStepKeys(id: HelpTopicId): string[] {
  return Array.from({ length: HELP_TOPICS[id].steps }, (_, i) => `help.${id}.s${i + 1}`);
}

export function helpTipKeys(id: HelpTopicId): string[] {
  return Array.from({ length: HELP_TOPICS[id].tips }, (_, i) => `help.${id}.tip${i + 1}`);
}

/** Every translation key a topic needs — the completeness test walks this. */
export function helpKeys(id: HelpTopicId): string[] {
  return [helpTitleKey(id), helpSummaryKey(id), ...helpStepKeys(id), ...helpTipKeys(id)];
}

export interface HelpSegment {
  kind: 'text' | 'control';
  text: string;
}

/**
 * Splits a step into plain text and the on-screen controls it names, which are
 * written as [[TAKE]] in the translation.
 *
 * The point of the markup is that a step saying "press TAKE" is useless if the
 * reader cannot tell which words are the button; rendering those as chips that
 * look like the real control is what makes the instructions followable while
 * staring at the panel.
 */
export function parseHelpText(text: string): HelpSegment[] {
  const segments: HelpSegment[] = [];
  const pattern = /\[\[(.+?)\]\]/g;
  let cursor = 0;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, match.index) });
    }
    segments.push({ kind: 'control', text: match[1] });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }
  return segments;
}
