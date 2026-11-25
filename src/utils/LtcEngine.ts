import Timecode from 'smpte-timecode';
import type { TimecodeInstance } from 'smpte-timecode';

export interface LtcSettings {
  fps: number;
  sampleRate: number;
  volume: number;
  isDropFrame: boolean;
  userBits: string; // 8 hex digits, e.g. "AABBCCDD"
  outputMode: 'stereo' | 'mono-l'; // stereo means TC on both, mono-l means TC on L only
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
    // Use exact rational FPS if provided, else derive from float. Resolved
    // BEFORE the start timecode: Date starts go through timecodeFromDate(),
    // which needs the rational rate.
    this.fpsNum = settings.fpsNum || this.deriveNumerator(settings.fps);
    this.fpsDen = settings.fpsDen || this.deriveDenominator(settings.fps);
    this.currentTimecode = startTime instanceof Date
      ? this.timecodeFromDate(startTime)
      : Timecode(startTime, settings.fps, settings.isDropFrame);
  }

  /**
   * Builds a timecode from a wall-clock Date at the exact rational rate.
   *
   * Delegating this to `Timecode(Date, fps)` is wrong for fractional rates:
   * smpte-timecode rounds the rate to 2 decimals internally (23.976 → 23.98)
   * before `frameCount = elapsedMs * rate / 1000`, so a 23.976 TOD timecode
   * starts ~7 s fast by noon (and 29.97 ~1 frame fast). Computing the frame
   * count here with fpsNum/fpsDen and constructing from the count keeps the
   * label on the true 24000/1001 (resp. 30000/1001) rate. Wall-clock
   * components (not Date subtraction) are used so DST transitions don't
   * shift the label.
   */
  private timecodeFromDate(date: Date): TimecodeInstance {
    const elapsedMs = (((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000)
      + date.getMilliseconds();
    const frameCount = Math.round(elapsedMs * this.fpsNum / (1000 * this.fpsDen));
    return Timecode(frameCount, [this.fpsNum, this.fpsDen], this.settings.isDropFrame);
  }

  /** Frames in a 24 h day at the nominal (label) rate, for diff wrapping. */
  private framesPerDay(): number {
    const nominal = Math.round(this.fpsNum / this.fpsDen);
    return nominal * 86400 - (this.settings.isDropFrame ? 2 * (1440 - 144) * (nominal >= 60 ? 2 : 1) : 0);
  }

  /** Wraps a raw frame difference into ±half a day (midnight rollover). */
  private wrapFrameDiff(diff: number): number {
    const day = this.framesPerDay();
    let d = diff % day;
    if (d > day / 2) d -= day;
    if (d < -day / 2) d += day;
    return d;
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

  public setFps(fps: number, isDrop: boolean) {
    // Build the new timecode BEFORE mutating any state: Timecode() throws when
    // the stored label can't exist at the new rate (frame >= fps, or DF
    // frames 0/1 at a non-10th minute). Assigning settings first would leave a
    // half-applied rate change behind on throw.
    const next = Timecode(this.currentTimecode.toString(), fps, isDrop);
    this.settings.fps = fps;
    this.settings.isDropFrame = isDrop;
    this.currentTimecode = next;

    this.fpsNum = this.deriveNumerator(fps);
    this.fpsDen = this.deriveDenominator(fps);
  }

  public setUserBits(hex: string) {
    this.settings.userBits = hex.padEnd(8, '0').substring(0, 8).toUpperCase();
  }

  public getTimecodeString(): string {
    return this.currentTimecode.toString();
  }

  public syncWithOffset(offset: number) {
    this.currentTimecode = this.timecodeFromDate(this.dateForOffset(offset));
  }

  /** Returns the NTP-corrected wall-clock date for a given offset in milliseconds. */
  public dateForOffset(offsetMs: number): Date {
    return new Date(Date.now() + offsetMs);
  }

  /** Returns the timecode string for a given NTP offset without mutating internal state. */
  public getTimecodeForOffset(offsetMs: number): string {
    return this.timecodeFromDate(this.dateForOffset(offsetMs)).toString();
  }

  public setManualTimecode(tcStr: string) {
    this.currentTimecode = Timecode(tcStr, this.settings.fps, this.settings.isDropFrame);
  }

  /**
   * Builds the latency-compensated master timecode (smpte-timecode instance)
   * without mutating internal state. Returns null when the peer-supplied TC
   * string can't be parsed — Timecode() throws on malformed labels, and a
   * hostile/buggy peer must not be able to crash the PeerJS 'data' handler
   * on every heartbeat. Mirrors getDiffSeconds' parse-failure contract:
   * "cannot compute" is reported to the caller, which skips the correction.
   */
  private computeCorrectedTimecode(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean): TimecodeInstance | null {
    let masterTc: TimecodeInstance;
    try {
      masterTc = Timecode(masterTcStr, this.settings.fps, this.settings.isDropFrame);
    } catch {
      return null;
    }
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
   * Returns null when the master TC can't be parsed (see
   * computeCorrectedTimecode) — callers must skip the correction.
   */
  public getCorrectedTc(masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean): string | null {
    return this.computeCorrectedTimecode(masterTcStr, oneWayLatencyMs, isMasterRunning)?.toString() ?? null;
  }

  /**
   * Signed frame difference (target - current). Positive means the target is
   * ahead of the current timecode. Returns 0 if the target cannot be parsed.
   */
  public signedFrameDiffTo(targetTcStr: string): number {
    try {
      const targetTc = Timecode(targetTcStr, this.settings.fps, this.settings.isDropFrame);
      return this.wrapFrameDiff(targetTc.frameCount - this.currentTimecode.frameCount);
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
      const diffFrames = Math.abs(this.wrapFrameDiff(targetFrames - currentFrames));
      return diffFrames * this.fpsDen / this.fpsNum;
    } catch {
      return Infinity; // If parsing fails, always sync
    }
  }

}
