import { describe, it, expect } from 'vitest';
import { effectiveOutputVolume, MIC_OUTPUT_GAIN } from './audioLevel';

describe('effectiveOutputVolume', () => {
  it('passes volume through on line, attenuates on mic', () => {
    expect(effectiveOutputVolume(0.8, 'line')).toBe(0.8);
    expect(effectiveOutputVolume(0.8, 'mic')).toBeCloseTo(0.8 * MIC_OUTPUT_GAIN);
  });
});
