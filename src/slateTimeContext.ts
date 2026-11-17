import { createContext, useContext } from 'react';

/**
 * slateTimeContext.ts — the visual slate's live timecode, isolated from the
 * main LTC context.
 *
 * The worklet posts a new TC string every frame while the slate is open;
 * keeping that string in the shared LTC state forced every useLTC() consumer
 * to re-render ~30x/sec. This context's only consumer is <VisualSlate>, so
 * updates now re-render just the overlay that displays them.
 */
export const SlateTimeContext = createContext<string>('00:00:00:00');

export function useSlateTime(): string {
  return useContext(SlateTimeContext);
}
