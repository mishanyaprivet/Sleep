/**
 * Browser wiring for overnight recording: microphone → level/spectrum analysis,
 * accelerometer → movement, screen wake lock, and short audio clips of
 * probable snoring / loud noises. All analysis runs on-device.
 */
import type { NightRecording, RecordingSensitivity, SoundClip } from '../data/types';
import { newId } from '../data/repository';
import {
  downsample,
  encodeWav,
  EpochAggregator,
  EventDetector,
  isSnoreCandidate,
  lowBandRatio,
  MotionDetector,
  NoiseFloor,
  RingBuffer,
  rmsDb,
  SENSITIVITY_DB,
  SnoreTracker,
  summarize,
} from './soundAnalysis';

export interface LiveStats {
  level: number; // dB above floor
  snoring: boolean;
  snoreEpisodes: number;
  snoreMin: number;
  noiseEvents: number;
  clips: number;
  motion: boolean;
  wakeLock: boolean;
}

export interface RecorderOptions {
  startedAt: string;
  sensitivity: RecordingSensitivity;
  keepClips: boolean;
  prior?: NightRecording | null;
  saveClip: (clip: SoundClip, blob: Blob) => Promise<void>;
  deleteClip: (id: string) => Promise<void>;
  onUpdate: (s: LiveStats) => void;
}

const MAX_CLIPS = { snore: 20, noise: 10 } as const;
const PRE_ROLL = 4;
const POST_ROLL = 12;

type MotionPermission = 'granted' | 'denied' | 'unsupported';

/** Must be called synchronously inside a user gesture (iOS requirement). */
export function requestMotionPermission(): Promise<MotionPermission> {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return Promise.resolve('unsupported');
  const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
  if (typeof DME.requestPermission === 'function') {
    return DME.requestPermission().catch(() => 'denied' as const);
  }
  return Promise.resolve('granted');
}

export function micSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export class NightRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Float32Array<ArrayBuffer> | null = null;
  private wakeLock: { release: () => Promise<void> } | null = null;
  private startedMs: number;
  private floor = new NoiseFloor();
  private detector: EventDetector;
  private snore = new SnoreTracker();
  private agg = new EpochAggregator();
  private motionDet = new MotionDetector();
  private motionSeen = false;
  private noiseEvents = 0;
  private clips: SoundClip[];
  private ring: RingBuffer | null = null;
  private dsFactor = 4;
  private dsRate = 12000;
  private capture: { startT: number; chunks: Float32Array[]; until: number; snore: boolean; loud: number; peak: number } | null = null;
  private lastLevel = 0;
  private lastEmit = 0;
  private prior: NightRecording | null;
  private thresholdDb: number;
  private stopped = false;

  constructor(private opts: RecorderOptions) {
    this.startedMs = new Date(opts.startedAt).getTime();
    this.thresholdDb = SENSITIVITY_DB[opts.sensitivity];
    this.detector = new EventDetector(this.thresholdDb);
    this.prior = opts.prior ?? null;
    this.clips = [...(opts.prior?.clips ?? [])];
    this.noiseEvents = opts.prior?.noiseEvents ?? 0;
    this.motionSeen = opts.prior?.motionAvailable ?? false;
  }

  /** Start capturing. Call from a user gesture. Throws if the microphone is unavailable. */
  async start(motionPermission: Promise<MotionPermission>): Promise<{ motion: boolean }> {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const ctxResume = this.ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    await ctxResume;
    const sr = this.ctx.sampleRate;
    this.dsFactor = Math.max(1, Math.round(sr / 12000));
    this.dsRate = Math.round(sr / this.dsFactor);
    this.ring = new RingBuffer(this.dsRate * (PRE_ROLL + 1));

    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.2;
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    src.connect(this.analyser);
    src.connect(this.processor);
    this.processor.connect(mute).connect(this.ctx.destination);
    this.processor.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));

    const motion = (await motionPermission) === 'granted';
    if (motion) window.addEventListener('devicemotion', this.onMotion);
    await this.acquireWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);
    return { motion };
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void this.acquireWakeLock();
      void this.ctx?.resume();
    }
  };

  private async acquireWakeLock() {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl && document.visibilityState === 'visible') this.wakeLock = await wl.request('screen');
    } catch {
      this.wakeLock = null;
    }
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    this.motionSeen = true;
    const t = (Date.now() - this.startedMs) / 1000;
    this.agg.motion(t, this.motionDet.push(a.x, a.y, a.z));
  };

  private onAudio(input: Float32Array) {
    if (this.stopped || !this.analyser || !this.freq || !this.ctx) return;
    const t = (Date.now() - this.startedMs) / 1000;
    const db = rmsDb(input);
    this.analyser.getFloatFrequencyData(this.freq);
    const low = lowBandRatio(this.freq, this.ctx.sampleRate, this.analyser.fftSize);
    const floor = this.floor.update(db);
    const above = db - floor;
    this.lastLevel = above;
    this.agg.frame(t, db);

    const ds = downsample(input, this.dsFactor);
    this.ring!.push(ds);
    if (this.capture) this.capture.chunks.push(ds);

    const wasIn = this.detector.inEvent;
    const ev = this.detector.push(t, above, low);
    if (!wasIn && this.detector.inEvent && !this.capture && this.opts.keepClips) {
      this.capture = { startT: t - PRE_ROLL, chunks: [this.ring!.tail(this.dsRate * PRE_ROLL)], until: t + POST_ROLL, snore: false, loud: 0, peak: 0 };
    }
    if (ev) {
      const res = this.snore.push(ev);
      if (this.capture) this.capture.peak = Math.max(this.capture.peak, ev.peakAboveFloor);
      if (res === 'started' && this.capture) this.capture.snore = true;
      if (!isSnoreCandidate(ev)) {
        this.agg.event(ev.start);
        if (ev.peakAboveFloor >= this.thresholdDb + 5) {
          this.noiseEvents++;
          if (this.capture) this.capture.loud = Math.max(this.capture.loud, ev.peakAboveFloor);
        }
      }
    }
    this.snore.tick(t);
    if (this.capture && t >= this.capture.until) void this.finishCapture();

    if (Date.now() - this.lastEmit > 800) {
      this.lastEmit = Date.now();
      this.opts.onUpdate(this.live());
    }
  }

  private async finishCapture() {
    const c = this.capture;
    this.capture = null;
    if (!c) return;
    const kind: SoundClip['kind'] | null = c.snore ? 'snore' : c.loud >= this.thresholdDb + 8 ? 'noise' : null;
    if (!kind) return;
    const peak = Math.round(c.peak);
    const same = this.clips.filter((x) => x.kind === kind);
    if (same.length >= MAX_CLIPS[kind]) {
      const quietest = same.reduce((a, b) => (b.peakAboveFloor < a.peakAboveFloor ? b : a));
      if (quietest.peakAboveFloor >= peak) return;
      this.clips = this.clips.filter((x) => x.id !== quietest.id);
      void this.opts.deleteClip(quietest.id);
    }
    const total = c.chunks.reduce((a, x) => a + x.length, 0);
    const pcm = new Float32Array(total);
    let o = 0;
    for (const ch of c.chunks) {
      pcm.set(ch, o);
      o += ch.length;
    }
    const clip: SoundClip = {
      id: newId(),
      at: new Date(this.startedMs + Math.max(0, c.startT) * 1000).toISOString(),
      durationSec: Math.round(total / this.dsRate),
      kind,
      peakAboveFloor: peak,
    };
    try {
      await this.opts.saveClip(clip, encodeWav(pcm, this.dsRate));
      this.clips.push(clip);
    } catch (e) {
      console.warn('Lumen: could not save clip', e);
    }
  }

  live(): LiveStats {
    const priorSnore = (this.prior?.snoreMin ?? 0) * 60;
    const nowSnore = this.snore.episodes.reduce((a, e) => a + (e.end - e.start), 0);
    return {
      level: Math.max(0, this.lastLevel),
      snoring: this.snore.snoring,
      snoreEpisodes: (this.prior?.snoreEpisodes ?? 0) + this.snore.episodes.length,
      snoreMin: Math.round((priorSnore + nowSnore) / 60),
      noiseEvents: this.noiseEvents,
      clips: this.clips.length,
      motion: this.motionSeen,
      wakeLock: !!this.wakeLock,
    };
  }

  /** Current summary (used for periodic saves and on stop). */
  snapshot(endedAt = new Date()): NightRecording {
    const totalMin = Math.max(1, Math.ceil((endedAt.getTime() - this.startedMs) / 60_000));
    const epochs = this.agg.build(totalMin, this.snore.secondsByMinute(), this.prior?.epochs ?? []);
    return summarize({
      startedAt: this.opts.startedAt,
      endedAt: endedAt.toISOString(),
      epochs,
      snoreEpisodes: (this.prior?.snoreEpisodes ?? 0) + this.snore.episodes.length,
      noiseEvents: this.noiseEvents,
      motionAvailable: this.motionSeen,
      clips: [...this.clips].sort((a, b) => a.at.localeCompare(b.at)),
      sensitivity: this.opts.sensitivity,
    });
  }

  async stop(): Promise<NightRecording> {
    this.stopped = true;
    if (this.capture) await this.finishCapture();
    const result = this.snapshot();
    this.dispose();
    return result;
  }

  dispose() {
    this.stopped = true;
    window.removeEventListener('devicemotion', this.onMotion);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((tr) => tr.stop());
    void this.ctx?.close().catch(() => undefined);
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }
}
