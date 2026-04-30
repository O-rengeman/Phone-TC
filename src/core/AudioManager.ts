import type { LtcSettings } from '../utils/LtcEngine';
import { LtcEngine } from '../utils/LtcEngine';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private ltcEngine: LtcEngine | null = null;

  public async initialize(
    settings: LtcSettings,
    onMessage: (tc: string) => void
  ): Promise<LtcEngine> {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.ltcEngine = new LtcEngine(settings);

    // Load AudioWorklet inline
    const workletCode = `
      ${LtcEngine.toString()}
      
      class LtcProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.engine = new LtcEngine({
             fps: ${settings.fps},
             sampleRate: 48000,
             volume: ${settings.volume},
             isDropFrame: ${settings.isDropFrame},
             userBits: "${settings.userBits}",
             outputMode: "${settings.outputMode}",
             fpsNum: ${settings.fpsNum},
             fpsDen: ${settings.fpsDen}
          });
          
          this.port.onmessage = (e) => {
            if (e.data.type === 'sync') {
              this.engine.jamSyncDirect(e.data.tc, e.data.latency, e.data.isRunning);
            } else if (e.data.type === 'update') {
              this.engine.setFps(e.data.fps, e.data.isDropFrame);
              this.engine.setVolume(e.data.volume);
              this.engine.setUserBits(e.data.ubit);
              this.outputMode = e.data.mode;
              this.engine.jamSyncDirect(
                (e.data.h < 10 ? '0' : '') + e.data.h + ':' + 
                (e.data.m < 10 ? '0' : '') + e.data.m + ':' + 
                (e.data.s < 10 ? '0' : '') + e.data.s + ':' + 
                (e.data.f < 10 ? '0' : '') + e.data.f, 0, true
              );
            } else if (e.data.type === 'pause') {
              this.isPaused = true;
            } else if (e.data.type === 'resume') {
              this.isPaused = false;
            } else if (e.data.type === 'manual-tc') {
              this.engine.setManualTimecode(e.data.tc);
            }
          };
          this.outputMode = "${settings.outputMode}";
          this.isPaused = false;
        }
        
        process(inputs, outputs, parameters) {
          const output = outputs[0];
          const input = inputs[0]; // For mic input
          
          if (!this.isPaused) {
             const samples = this.engine.generateFrameSamples();
             for (let i = 0; i < output[0].length; i++) {
               const sample = samples[i % samples.length] || 0;
               if (this.outputMode === 'stereo') {
                 output[0][i] = sample;
                 output[1][i] = sample;
               } else if (this.outputMode === 'mono-l') {
                 output[0][i] = sample;
                 output[1][i] = input && input[0] ? input[0][i] : 0;
               }
             }
          } else {
             for (let i = 0; i < output[0].length; i++) {
                output[0][i] = 0;
                output[1][i] = 0;
             }
          }
          
          if (currentTime * 1000 % 33 < 5) {
             this.port.postMessage({ tc: this.engine.getTimecodeString() });
          }
          return true;
        }
      }
      registerProcessor('ltc-processor', LtcProcessor);
    `;

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.workletNode = new AudioWorkletNode(this.ctx, 'ltc-processor', {
      outputChannelCount: [2]
    });

    // Send initial state
    const tcStr = this.ltcEngine.getTimecodeString();
    const parts = tcStr.split(':').map(Number);
    
    this.workletNode.port.postMessage({
      type: 'update',
      ...settings,
      h: parts[0] || 0, m: parts[1] || 0, s: parts[2] || 0, f: parts[3] || 0,
      mode: settings.outputMode
    });

    this.workletNode.port.onmessage = (e) => {
      const tc = e.data.tc;
      if (this.ltcEngine) {
        this.ltcEngine.setManualTimecode(tc); // Keep local engine in sync
      }
      onMessage(tc);
    };

    if (settings.outputMode === 'mono-l') {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.micSource = this.ctx.createMediaStreamSource(this.micStream);
        this.micSource.connect(this.workletNode);
      } catch (err) {
        console.warn('Mic access denied');
      }
    }

    this.workletNode.connect(this.ctx.destination);
    
    return this.ltcEngine;
  }

  public getWorkletNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  public pause() {
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  public resume() {
    this.workletNode?.port.postMessage({ type: 'resume' });
  }

  public syncWorklet(tc: string, latency: number, isRunning: boolean) {
    this.ltcEngine?.jamSyncDirect(tc, latency, isRunning);
    this.workletNode?.port.postMessage({ type: 'sync', tc, latency, isRunning });
  }

  public stop() {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
      this.ctx = null;
    }
    this.ltcEngine = null;
  }
}
