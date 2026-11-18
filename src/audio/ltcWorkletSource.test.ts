import { describe, it, expect } from 'vitest';
import { LTC_WORKLET_SOURCE } from './ltcWorkletSource';

// LTC_WORKLET_SOURCE is the serialized AudioWorklet module — a plain script
// string loaded via Blob URL in production. jsdom can't run a real
// AudioWorklet, but we can evaluate the source with stubbed globals
// (AudioWorkletProcessor base class, registerProcessor, sampleRate) and then
// drive the registered processor class directly: constructor options,
// port.onmessage handlers and process() are all exercised for real.

class FakePort {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: unknown[] = [];
  postMessage(msg: unknown) {
    this.sent.push(msg);
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}

class FakeAudioWorkletProcessor {
  port = new FakePort();
}

interface ProcessorOptions {
  fps?: number;
  isDrop?: boolean;
  fpsNum?: number;
  fpsDen?: number;
  framesPerSec?: number;
  volume?: number;
  ubit?: string;
  mode?: string;
  h?: number;
  m?: number;
  s?: number;
  f?: number;
}

interface FakeProcessor {
  settings: Record<string, unknown> & ProcessorOptions;
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  port: FakePort;
  process(inputs: unknown, outputs: Float32Array[][]): boolean;
}

function loadProcessor(overrides: ProcessorOptions = {}): FakeProcessor {
  let ProcessorClass: (new (options: { processorOptions: ProcessorOptions }) => FakeProcessor) | null = null;
  const registerProcessor = (_name: string, cls: new (options: { processorOptions: ProcessorOptions }) => FakeProcessor) => {
    ProcessorClass = cls;
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    'AudioWorkletProcessor',
    'registerProcessor',
    'sampleRate',
    LTC_WORKLET_SOURCE,
  ) as unknown as (
    base: typeof FakeAudioWorkletProcessor,
    register: typeof registerProcessor,
    sampleRate: number,
  ) => void;
  factory(FakeAudioWorkletProcessor, registerProcessor, 48000);
  // Copy to a const: ProcessorClass is assigned inside the registerProcessor
  // closure, so narrowing the `let` directly leaves an error type downstream.
  // Cast through unknown — TS tracks the `let` as still-null here.
  const Processor = ProcessorClass as unknown as
    | (new (options: { processorOptions: ProcessorOptions }) => FakeProcessor)
    | null;
  if (!Processor) throw new Error('ltc-processor was not registered');
  // The processor is built by eval'd worklet source, so its runtime shape is
  // only known through our FakeProcessor contract (asserted at the cast above).
  return new Processor({
    processorOptions: {
      fps: 30,
      isDrop: false,
      fpsNum: 30000,
      fpsDen: 1000,
      framesPerSec: 30,
      volume: 0.5,
      ubit: '00000000',
      mode: 'stereo',
      h: 0,
      m: 0,
      s: 0,
      f: 0,
      ...overrides,
    },
  });
}

describe('LTC worklet source', () => {
  it('evaluates as a valid script and registers ltc-processor', () => {
    expect(() => loadProcessor()).not.toThrow();
  });

  it('config message still applies volume/ubit/mode', () => {
    const p = loadProcessor();
    p.port.emit({ type: 'config', volume: 0.9, ubit: 'AABBCCDD', mode: 'mono-l' });
    expect(p.settings.volume).toBe(0.9);
    expect(p.settings.ubit).toBe('AABBCCDD');
    expect(p.settings.mode).toBe('mono-l');
  });

  it('config message adopts a live fps change (rate fields update settings)', () => {
    const p = loadProcessor();
    p.port.emit({
      type: 'config',
      fps: 24,
      fpsNum: 24000,
      fpsDen: 1000,
      framesPerSec: 24,
      isDrop: false,
    });
    expect(p.settings.fps).toBe(24);
    expect(p.settings.fpsNum).toBe(24000);
    expect(p.settings.fpsDen).toBe(1000);
    expect(p.settings.framesPerSec).toBe(24);
    expect(p.settings.isDrop).toBe(false);
  });

  it('clamps the live frame counter when a rate drop leaves it above the new max', () => {
    const p = loadProcessor();
    p.frames = 28; // valid at 30fps, impossible at 24fps
    p.port.emit({ type: 'config', fps: 24, fpsNum: 24000, fpsDen: 1000, framesPerSec: 24 });
    expect(p.frames).toBe(23);
  });

  it('re-normalizes drop-frame-illegal labels when switching to drop-frame', () => {
    const p = loadProcessor();
    // 00:01:00:00 is a legal NDF label but frames 0/1 are illegal in DF.
    p.minutes = 1;
    p.seconds = 0;
    p.frames = 0;
    p.port.emit({ type: 'config', isDrop: true });
    expect(p.settings.isDrop).toBe(true);
    expect(p.frames).toBe(2);
  });

  it('does not touch the frame counter when config carries no rate change', () => {
    const p = loadProcessor();
    p.frames = 7;
    p.port.emit({ type: 'config', volume: 0.1 });
    p.port.emit({
      type: 'config',
      fps: 30, fpsNum: 30000, fpsDen: 1000, framesPerSec: 30, isDrop: false,
    });
    expect(p.frames).toBe(7);
  });

  it('keeps producing output after a mid-run rate change', () => {
    const p = loadProcessor();
    const out: Float32Array[] = [new Float32Array(128), new Float32Array(128)];
    expect(p.process([], [out])).toBe(true);
    p.port.emit({ type: 'config', fps: 25, fpsNum: 25000, fpsDen: 1000, framesPerSec: 25 });
    const out2: Float32Array[] = [new Float32Array(128), new Float32Array(128)];
    expect(p.process([], [out2])).toBe(true);
    // LTC is a non-zero biphase signal — at least one sample must be non-zero.
    expect(out2[0].some((v) => v !== 0)).toBe(true);
  });
});
