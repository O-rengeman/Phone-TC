import Timecode from 'smpte-timecode';
import type { TimecodeInstance } from 'smpte-timecode';

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

/**
 * LtcEngine — timecode MATH only.
 *
 * The actual LTC audio samples are generated inside the AudioWorklet
 * (see App.tsx `startEngine`), which is the single source of truth for the
 * emitted signal while running. This class no longer duplicates the sample /
 * bit generation; it owns timecode parsing, drift calculation and the math
 * needed to compute the latency-compensated correction that is pushed into the
 * worklet. It is also used for the on-screen display while the engine is idle.
 */
export class LtcEngine {
  private settings: LtcSettings;
  private currentTimecode: TimecodeInstance;

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
  }

  public setUserBits(hex: string) {
    this.settings.userBits = hex.padEnd(8, '0').substring(0, 8).toUpperCase();
  }

  public getTimecodeString(): string {
    return this.currentTimecode.toString();
  }

  /** Returns the current timecode split into [h, m, s, f]. */
  public getTimecodeParts(): { h: number; m: number; s: number; f: number } {
    const tc = this.currentTimecode;
    return { h: tc.hours, m: tc.minutes, s: tc.seconds, f: tc.frames };
  }

  public resetToSystemTime() {
    this.currentTimecode = Timecode(new Date(), this.settings.fps, this.settings.isDropFrame);
  }

  public syncWithOffset(offset: number) {
    this.currentTimecode = Timecode(this.dateForOffset(offset), this.settings.fps, this.settings.isDropFrame);
  }

  /** Returns the NTP-corrected wall-clock date for a given offset in milliseconds. */
  public dateForOffset(offsetMs: number): Date {
    return new Date(Date.now() + offsetMs);
  }

  /** Returns the timecode string for a given NTP offset without mutating internal state. */
  public getTimecodeForOffset(offsetMs: number): string {
    return Timecode(this.dateForOffset(offsetMs), this.settings.fps, this.settings.isDropFrame).toString();
  }

  public setManualTimecode(tcStr: string) {
    this.currentTimecode = Timecode(tcStr, this.settings.fps, this.settings.isDropFrame);
  }

  /**
   * Directly sync to master's timecode, compensating for one-way network latency.
   * Uses performance.now()-based timing for sub-millisecond precision.
   */
  public jamSyncDirect(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean) {
    this.currentTimecode = this.computeCorrectedTimecode(masterTcStr, oneWayLatencyMs, isMasterRunning);
  }

  /**
   * Builds the latency-compensated master timecode (smpte-timecode instance)
   * without mutating internal state.
   */
  private computeCorrectedTimecode(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean): TimecodeInstance {
    const masterTc = Timecode(masterTcStr, this.settings.fps, this.settings.isDropFrame);
    if (isMasterRunning && oneWayLatencyMs > 0) {
      // Use rational FPS for precise frame calculation
      const elapsedFrames = Math.round(oneWayLatencyMs * this.fpsNum / (1000 * this.fpsDen));
      masterTc.add(elapsedFrames);
    }
    return masterTc;
  }

  /**
   * Returns the latency-compensated master timecode as a "HH:MM:SS:FF" string.
   * Used by the main thread to push a jam target into the AudioWorklet.
   */
  public getCorrectedTc(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean): string {
    return this.computeCorrectedTimecode(masterTcStr, oneWayLatencyMs, isMasterRunning).toString();
  }

  /**
   * Signed frame difference (target - current). Positive means the target is
   * ahead of the current timecode. Returns 0 if the target cannot be parsed.
   */
  public signedFrameDiffTo(targetTcStr: string): number {
    try {
      const targetTc = Timecode(targetTcStr, this.settings.fps, this.settings.isDropFrame);
      return targetTc.frameCount - this.currentTimecode.frameCount;
    } catch {
      return 0;
    }
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
      const masterTc = this.computeCorrectedTimecode(masterTcStr, oneWayLatencyMs, isMasterRunning);
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
    const masterTc = this.computeCorrectedTimecode(masterTcStr, oneWayLatencyMs, isMasterRunning);
    const diff = this.getDiffSeconds(masterTc.toString());
    if (diff >= thresholdSec) {
      this.currentTimecode = masterTc;
      return true;
    }
    return false;
  }
}
