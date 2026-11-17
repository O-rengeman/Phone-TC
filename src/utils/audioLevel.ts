/**
 * audioLevel.ts — the mic/line output-level rule.
 *
 * `outputLevel === 'line' ? volume : volume * MIC_OUTPUT_GAIN` was copied into
 * four places (engine settings, worklet config, two volume effects) and one
 * copy forgot the scaling entirely, leaving the engine's final volume to
 * depend on effect ordering. Single-sourced here.
 */

export type OutputLevel = 'mic' | 'line';

/** Attenuation applied to the user volume when feeding a mic-level input. */
export const MIC_OUTPUT_GAIN = 0.1;

export function effectiveOutputVolume(volume: number, outputLevel: OutputLevel): number {
  return outputLevel === 'line' ? volume : volume * MIC_OUTPUT_GAIN;
}
