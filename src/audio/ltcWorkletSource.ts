// LTC AudioWorklet processor source.
//
// An AudioWorklet module must be fetched as a standalone script, so this is kept
// as a string and loaded via a Blob URL in App.tsx (`startEngine`). It was
// extracted verbatim from the former inline definition to keep App.tsx focused;
// the emitted-audio behaviour is byte-identical to before.
//
// The worklet is the single source of truth for the running LTC signal: it owns
// timecode advance, drop-frame handling, bit generation and sample synthesis,
// and applies jam/nudge/config corrections received from the main thread.
export const LTC_WORKLET_SOURCE = `
      class LtcProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();
          this.settings = options.processorOptions;
          this.phase = 1;
          this.frameCount = 0;
          this.sampleOffset = 0;
          this.currentFrameSamples = null;

          // Initial TC setup
          this.hours = this.settings.h;
          this.minutes = this.settings.m;
          this.seconds = this.settings.s;
          this.frames = this.settings.f;
          this.normalizeDropFrame();

          // Pending sync correction (frames). >0 = skip ahead, <0 = hold/fall back.
          this.pendingNudge = 0;

          // Receive sync corrections / live config from the main thread.
          // The worklet is the single source of truth for the emitted audio, so
          // all jam-sync corrections MUST arrive here to actually take effect.
          this.port.onmessage = (e) => {
            const d = e.data || {};
            if (d.type === 'jam') {
              this.hours = d.h; this.minutes = d.m; this.seconds = d.s; this.frames = d.f;
              this.normalizeDropFrame();
              // Regenerate the in-flight frame buffer from the new TC immediately.
              this.currentFrameSamples = null;
              this.sampleOffset = 0;
              this.pendingNudge = 0;
            } else if (d.type === 'nudge') {
              this.pendingNudge += (d.dir > 0 ? 1 : -1);
            } else if (d.type === 'config') {
              if (typeof d.volume === 'number') this.settings.volume = d.volume;
              if (typeof d.ubit === 'string') this.settings.ubit = d.ubit;
              if (typeof d.mode === 'string') this.settings.mode = d.mode;
            }
          };
        }

        /** SMPTE drop-frame: :00 and :01 are invalid at the start of non-10th minutes. */
        normalizeDropFrame() {
          if (
            this.settings.isDrop &&
            this.minutes % 10 !== 0 &&
            this.seconds === 0 &&
            this.frames < 2
          ) {
            this.frames = 2;
          }
        }

        addFrame() {
          this.frames++;
          const maxFrames = this.settings.framesPerSec;
          if (this.frames >= maxFrames) {
            this.frames = 0;
            this.seconds++;
            if (this.seconds >= 60) {
              this.seconds = 0;
              this.minutes++;
              if (this.minutes >= 60) {
                this.minutes = 0;
                this.hours++;
                if (this.hours >= 24) this.hours = 0;
              }
              // Drop two frame numbers at each minute boundary except every 10th minute.
              if (this.settings.isDrop && this.minutes % 10 !== 0) {
                this.frames = 2;
              }
            }
          }

          this.port.postMessage({
            tc: \`\${String(this.hours).padStart(2, '0')}:\${String(this.minutes).padStart(2, '0')}:\${String(this.seconds).padStart(2, '0')}:\${String(this.frames).padStart(2, '0')}\`
          });
        }

        generateBits() {
          const bits = new Array(80).fill(0);
          const f = this.frames, s = this.seconds, m = this.minutes, h = this.hours;
          const setBits = (arr, start, count, val) => {
            for (let i = 0; i < count; i++) arr[start + i] = (val >> i) & 1;
          };
          setBits(bits, 0, 4, f % 10); setBits(bits, 8, 2, Math.floor(f / 10));
          bits[10] = this.settings.isDrop ? 1 : 0;
          setBits(bits, 16, 4, s % 10); setBits(bits, 24, 3, Math.floor(s / 10));
          setBits(bits, 32, 4, m % 10); setBits(bits, 40, 3, Math.floor(m / 10));
          setBits(bits, 48, 4, h % 10); setBits(bits, 56, 2, Math.floor(h / 10));
          // User bits
          for (let i = 0; i < 8; i++) setBits(bits, 4 + (i * 8), 4, parseInt(this.settings.ubit[i], 16) || 0);
          const sync = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
          for (let i = 0; i < 16; i++) bits[64 + i] = sync[i];
          return bits;
        }

        process(inputs, outputs) {
          const outputL = outputs[0][0];
          const outputR = outputs[0][1];
          const input = inputs[0] ? inputs[0][0] : null;
          if (!outputL) return true;

          for (let i = 0; i < outputL.length; i++) {
            if (!this.currentFrameSamples || this.sampleOffset >= this.currentFrameSamples.length) {
              const bits = this.generateBits();
              const sr = sampleRate;
              const nextEnd = Math.floor((this.frameCount + 1) * sr * this.settings.fpsDen / this.settings.fpsNum);
              const curStart = Math.floor(this.frameCount * sr * this.settings.fpsDen / this.settings.fpsNum);
              const count = nextEnd - curStart;
              this.currentFrameSamples = new Float32Array(count);
              const spb = count / 80;
              let sIdx = 0;
              for (let b = 0; b < 80; b++) {
                const bit = bits[b];
                const bEnd = Math.round((b + 1) * spb);
                const bMid = Math.round((b + 0.5) * spb);
                this.phase *= -1;
                while (sIdx < bEnd && sIdx < count) {
                  if (bit === 1 && sIdx === bMid) this.phase *= -1;
                  this.currentFrameSamples[sIdx] = this.phase * this.settings.volume;
                  sIdx++;
                }
              }
              this.sampleOffset = 0;
              this.frameCount++;
              // Apply any pending sync nudge at the frame boundary:
              //  - negative: hold the current frame (device falls back by 1)
              //  - positive: advance an extra frame (device skips ahead by 1)
              if (this.pendingNudge < 0) {
                this.pendingNudge++;
              } else {
                this.addFrame();
                if (this.pendingNudge > 0) {
                  this.addFrame();
                  this.pendingNudge--;
                }
              }
            }
            const s = this.currentFrameSamples[this.sampleOffset];
            outputL[i] = s;
            if (outputR) outputR[i] = this.settings.mode === 'stereo' ? s : (input ? input[i] : 0);
            this.sampleOffset++;
          }
          return true;
        }
      }
      registerProcessor('ltc-processor', LtcProcessor);
    `;
