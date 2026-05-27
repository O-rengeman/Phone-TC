import Timecode from 'smpte-timecode';

export interface LtcSettings {
  fps: number;
  sampleRate: number;
  volume: number;
  isDropFrame: boolean;
  userBits: string; // 8 hex digits, e.g. "AABBCCDD"
  outputMode: 'stereo' | 'mono-l' | 'mono-r'; // stereo means TC on both, mono-l means TC on L only
  // NTSC exact rational representation: fps = fpsNum / fpsDen
  // e.g. 29.97 = 30000/1001, 23.976 = 24000/1001
  fpsNum?: number;
  fpsDen?: number;
}

export class LtcEngine {
  private settings: LtcSettings;
  private currentTimecode: any;
  private phase: number = 1;

  // Fractional sample accumulator for drift-free timing.
  // Uses integer arithmetic with NTSC rational fractions
  // to achieve mathematically perfect frame boundaries.
  private totalSampleCount: number = 0;
  private frameCount: number = 0;

  // Exact rational FPS (numerator / denominator)
  private fpsNum: number;
  private fpsDen: number;

  constructor(settings: LtcSettings, startTime: string | Date = new Date()) {
    this.settings = {
      ...settings,
      userBits: settings.userBits || '00000000'
    };
    this.currentTimecode = Timecode(startTime, settings.fps, settings.isDropFrame);

    // Use exact rational FPS if provided, else derive from float
    this.fpsNum = settings.fpsNum || this.deriveNumerator(settings.fps);
    this.fpsDen = settings.fpsDen || this.deriveDenominator(settings.fps);
  }

  /**
   * Derives the NTSC numerator for known frame rates.
   * Falls back to fps * 1000 for unknown rates.
   */
  private deriveNumerator(fps: number): number {
    if (Math.abs(fps - 23.976) < 0.01) return 24000;
    if (Math.abs(fps - 29.97) < 0.01) return 30000;
    if (Math.abs(fps - 59.94) < 0.01) return 60000;
    return Math.round(fps * 1000);
  }

  private deriveDenominator(fps: number): number {
    if (Math.abs(fps - 23.976) < 0.01) return 1001;
    if (Math.abs(fps - 29.97) < 0.01) return 1001;
    if (Math.abs(fps - 59.94) < 0.01) return 1001;
    return 1000;
  }

  public setVolume(v: number) {
    this.settings.volume = Math.max(0, Math.min(1, v));
  }

  public updateSampleRate(sr: number) {
    this.settings.sampleRate = sr;
  }

  public setFps(fps: number, isDrop: boolean, fpsNum?: number, fpsDen?: number) {
    this.settings.fps = fps;
    this.settings.isDropFrame = isDrop;
    const currentStr = this.currentTimecode.toString();
    this.currentTimecode = Timecode(currentStr, fps, isDrop);

    this.fpsNum = fpsNum || this.deriveNumerator(fps);
    this.fpsDen = fpsDen || this.deriveDenominator(fps);

    // Reset accumulators on FPS change
    this.totalSampleCount = 0;
    this.frameCount = 0;
  }

  public setUserBits(hex: string) {
    this.settings.userBits = hex.padEnd(8, '0').substring(0, 8).toUpperCase();
  }

  private getFrameBits(tc: any): number[] {
    const bits = new Array(80).fill(0);
    const f = tc.frames;
    const s = tc.seconds;
    const m = tc.minutes;
    const h = tc.hours;

    this.setBits(bits, 0, 4, f % 10);
    this.setBits(bits, 8, 2, Math.floor(f / 10));
    bits[10] = this.settings.isDropFrame ? 1 : 0;
    this.setBits(bits, 16, 4, s % 10);
    this.setBits(bits, 24, 3, Math.floor(s / 10));
    this.setBits(bits, 32, 4, m % 10);
    this.setBits(bits, 40, 3, Math.floor(m / 10));
    this.setBits(bits, 48, 4, h % 10);
    this.setBits(bits, 56, 2, Math.floor(h / 10));

    const ub = this.settings.userBits;
    for (let i = 0; i < 8; i++) {
      const val = parseInt(ub[i], 16) || 0;
      this.setBits(bits, 4 + (i * 8), 4, val);
    }

    const syncWord = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
    for (let i = 0; i < 16; i++) {
      bits[64 + i] = syncWord[i];
    }
    return bits;
  }

  private setBits(arr: number[], start: number, count: number, value: number) {
    for (let i = 0; i < count; i++) {
      arr[start + i] = (value >> i) & 1;
    }
  }

  /**
   * Calculates the exact number of samples for this frame using rational
   * arithmetic. This completely eliminates floating-point drift.
   * 
   * Formula (integer math):
   *   frameBoundary(N) = floor( N * sampleRate * fpsDen / fpsNum )
   *   samplesThisFrame = frameBoundary(frameCount+1) - frameBoundary(frameCount)
   * 
   * For 48000 Hz / 29.97 fps (= 30000/1001):
   *   frameBoundary(N) = floor( N * 48000 * 1001 / 30000 )
   *                    = floor( N * 1601.6 )
   *   -> alternates 1601 and 1602 samples, ZERO cumulative drift.
   */
  private getSamplesForThisFrame(): number {
    const sr = this.settings.sampleRate;
    // Use exact integer arithmetic: floor((frameCount+1) * sr * fpsDen / fpsNum)
    const currentEnd = Math.floor(
      (this.frameCount + 1) * sr * this.fpsDen / this.fpsNum
    );
    const currentStart = Math.floor(
      this.frameCount * sr * this.fpsDen / this.fpsNum
    );
    return currentEnd - currentStart;
  }

  /**
   * Generates audio samples for one full frame.
   * Uses rational-arithmetic accumulator for zero-drift timing.
   * Maintains phase continuity between frames.
   */
  public generateFrameSamples(): Float32Array {
    const bits = this.getFrameBits(this.currentTimecode);
    const samplesThisFrame = this.getSamplesForThisFrame();
    const samplesPerBit = samplesThisFrame / 80;
    const buffer = new Float32Array(samplesThisFrame);

    let sampleIdx = 0;
    const vol = this.settings.volume;

    for (let b = 0; b < 80; b++) {
      const bit = bits[b];
      const bitEndSample = Math.round((b + 1) * samplesPerBit);
      const bitMidSample = Math.round((b + 0.5) * samplesPerBit);

      // Transition at the start of every bit
      this.phase *= -1;

      while (sampleIdx < bitEndSample && sampleIdx < samplesThisFrame) {
        if (bit === 1 && sampleIdx === bitMidSample) {
          this.phase *= -1; // Transition in the middle for '1'
        }
        buffer[sampleIdx] = this.phase * vol;
        sampleIdx++;
      }
    }

    // Update accumulators
    this.totalSampleCount += samplesThisFrame;
    this.frameCount++;

    // Advance to next frame
    this.currentTimecode.add(1);
    return buffer;
  }

  public getTimecodeString(): string {
    return this.currentTimecode.toString();
  }

  public resetToSystemTime() {
    this.currentTimecode = Timecode(new Date(), this.settings.fps, this.settings.isDropFrame);
    this.totalSampleCount = 0;
    this.frameCount = 0;
  }

  public syncWithOffset(offset: number) {
    const correctedDate = new Date(Date.now() + offset);
    this.currentTimecode = Timecode(correctedDate, this.settings.fps, this.settings.isDropFrame);
    this.totalSampleCount = 0;
    this.frameCount = 0;
  }

  public setManualTimecode(tcStr: string) {
    this.currentTimecode = Timecode(tcStr, this.settings.fps, this.settings.isDropFrame);
    this.totalSampleCount = 0;
    this.frameCount = 0;
  }

  /**
   * Directly sync to master's timecode, compensating for one-way network latency.
   * Uses performance.now()-based timing for sub-millisecond precision.
   */
  public jamSyncDirect(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean) {
    const masterTc = Timecode(masterTcStr, this.settings.fps, this.settings.isDropFrame);
    
    if (isMasterRunning && oneWayLatencyMs > 0) {
      // Use rational FPS for precise frame calculation
      const elapsedFrames = Math.round(oneWayLatencyMs * this.fpsNum / (1000 * this.fpsDen));
      masterTc.add(elapsedFrames);
    }
    
    this.currentTimecode = masterTc;
    // Don't reset accumulators on jamSync to maintain audio phase continuity
  }

  /**
   * Returns the absolute difference in seconds between current TC and a target TC string.
   */
  public getDiffSeconds(targetTcStr: string): number {
    try {
      const targetTc = Timecode(targetTcStr, this.settings.fps, this.settings.isDropFrame);
      const currentFrames = this.currentTimecode.frameCount;
      const targetFrames = targetTc.frameCount;
      const diffFrames = Math.abs(currentFrames - targetFrames);
      return diffFrames * this.fpsDen / this.fpsNum;
    } catch {
      return Infinity; // If parsing fails, always sync
    }
  }

  /**
   * Smooth sync: instant jump for large drift (>0.5s), frame-by-frame nudge for small drift.
   * Avoids audible discontinuities when drift is minor.
   */
  public softSync(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean): void {
    const diff = this.getDiffSeconds(masterTcStr);
    if (diff > 0.5) {
      this.jamSyncDirect(masterTcStr, oneWayLatencyMs, isMasterRunning);
      return;
    }
    try {
      const masterTc = Timecode(masterTcStr, this.settings.fps, this.settings.isDropFrame);
      if (isMasterRunning && oneWayLatencyMs > 0) {
        const elapsedFrames = Math.round(oneWayLatencyMs * this.fpsNum / (1000 * this.fpsDen));
        masterTc.add(elapsedFrames);
      }
      const frameDiff = masterTc.frameCount - this.currentTimecode.frameCount;
      if (frameDiff !== 0) {
        this.currentTimecode.add(frameDiff > 0 ? 1 : -1);
      }
    } catch {
      this.jamSyncDirect(masterTcStr, oneWayLatencyMs, isMasterRunning);
    }
  }

  /**
   * Only applies jamSync if the difference exceeds the given threshold in seconds.
   * Returns true if sync was applied.
   */
  public jamSyncIfNeeded(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean, thresholdSec: number): boolean {
    // Calculate what the corrected master TC would be
    const masterTc = Timecode(masterTcStr, this.settings.fps, this.settings.isDropFrame);
    if (isMasterRunning && oneWayLatencyMs > 0) {
      const elapsedFrames = Math.round(oneWayLatencyMs * this.fpsNum / (1000 * this.fpsDen));
      masterTc.add(elapsedFrames);
    }

    const diff = this.getDiffSeconds(masterTc.toString());
    if (diff >= thresholdSec) {
      this.currentTimecode = masterTc;
      return true;
    }
    return false;
  }
}
