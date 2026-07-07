// Minimal type definitions for `smpte-timecode` (ships no types of its own).
// Covers only the members this project uses; see node_modules/smpte-timecode.
declare module 'smpte-timecode' {
  export interface TimecodeInstance {
    frameCount: number;
    hours: number;
    minutes: number;
    seconds: number;
    frames: number;
    frameRate: number;
    frameRateNum: number;
    frameRateDen: number;
    dropFrame: boolean;
    /** Adds frames/timecode in place and returns this. */
    add(t: number | string | Date | TimecodeInstance, negative?: boolean, rollOverMaxHours?: number): TimecodeInstance;
    /** Subtracts frames/timecode in place and returns this. */
    subtract(t: number | string | Date | TimecodeInstance, rollOverMaxHours?: number): TimecodeInstance;
    toString(format?: string): string;
    valueOf(): number;
    toDate(): Date;
  }

  /** Callable with or without `new`; both return a Timecode instance. */
  interface TimecodeConstructor {
    (
      timeCode?: number | string | Date | object,
      frameRate?: number | [number, number],
      dropFrame?: boolean,
    ): TimecodeInstance;
    new (
      timeCode?: number | string | Date | object,
      frameRate?: number | [number, number],
      dropFrame?: boolean,
    ): TimecodeInstance;
  }

  const Timecode: TimecodeConstructor;
  export default Timecode;
}
