/**
 * Pure, testable sound & motion analysis for overnight recordings.
 *
 * What this does: detects sound events against an adaptive room-noise floor,
 * flags *probable* snoring (repeated low-frequency events in a breathing rhythm),
 * aggregates per-minute epochs, and estimates restlessness from motion + sound.
 *
 * What it does not do: measure sleep stages. Restlessness is labelled as an estimate.
 */
import type { NightRecording, RecordingSensitivity, SoundEpoch } from '../data/types';

export const FRAME_SEC = 0.1;

export const SENSITIVITY_DB: Record<RecordingSensitivity, number> = {
  low: 14,
  medium: 10,
  high: 7,
};

// ---------------------------------------------------------------------------
// Frame features
// ---------------------------------------------------------------------------

export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return 20 * Math.log10(rms + 1e-9);
}

/**
 * Share of spectral power between 60–400 Hz relative to 60–4000 Hz.
 * `freqDb` is AnalyserNode.getFloatFrequencyData output.
 */
export function lowBandRatio(freqDb: Float32Array, sampleRate: number, fftSize: number): number {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(60 / binHz));
  const mid = Math.floor(400 / binHz);
  const hi = Math.min(freqDb.length - 1, Math.floor(4000 / binHz));
  let low = 0;
  let total = 0;
  for (let i = lo; i <= hi; i++) {
    const p = Math.pow(10, freqDb[i] / 10);
    if (!Number.isFinite(p)) continue;
    total += p;
    if (i <= mid) low += p;
  }
  return total > 0 ? low / total : 0;
}

// ---------------------------------------------------------------------------
// Adaptive noise floor
// ---------------------------------------------------------------------------

export class NoiseFloor {
  value: number | null = null;
  private warm: number[] = [];

  update(db: number): number {
    if (this.value == null) {
      this.warm.push(db);
      if (this.warm.length >= 20) {
        const s = [...this.warm].sort((a, b) => a - b);
        this.value = s[Math.floor(s.length * 0.3)];
      }
      return this.value ?? db;
    }
    // Falls quickly, rises slowly — tracks the quiet background, not events.
    if (db < this.value) this.value += (db - this.value) * 0.05;
    else this.value += (db - this.value) * 0.0015;
    return this.value;
  }
}

// ---------------------------------------------------------------------------
// Event detection (hysteresis on level above floor)
// ---------------------------------------------------------------------------

export interface SoundEvent {
  start: number; // seconds since recording start
  end: number;
  peakAboveFloor: number;
  lowRatio: number;
}

export class EventDetector {
  private active: { start: number; peak: number; lowSum: number; n: number; quiet: number } | null = null;

  constructor(private thresholdDb: number) {}

  /** Feed one frame; returns a completed event when one ends. */
  push(t: number, aboveFloor: number, lowRatio: number): SoundEvent | null {
    const on = aboveFloor >= this.thresholdDb;
    const holdOn = aboveFloor >= this.thresholdDb - 3;
    if (!this.active) {
      if (on) this.active = { start: t, peak: aboveFloor, lowSum: lowRatio, n: 1, quiet: 0 };
      return null;
    }
    const a = this.active;
    if (holdOn) {
      a.peak = Math.max(a.peak, aboveFloor);
      a.lowSum += lowRatio;
      a.n++;
      a.quiet = 0;
      // Cap single events at 20 s (continuous noise is split into chunks).
      if (t - a.start >= 20) return this.close(t);
      return null;
    }
    a.quiet++;
    if (a.quiet >= 3) return this.close(t - a.quiet * FRAME_SEC);
    return null;
  }

  get inEvent() {
    return this.active != null;
  }

  private close(end: number): SoundEvent | null {
    const a = this.active!;
    this.active = null;
    const dur = end - a.start;
    if (dur < 0.25) return null;
    return { start: a.start, end, peakAboveFloor: a.peak, lowRatio: a.lowSum / a.n };
  }
}

// ---------------------------------------------------------------------------
// Snore tracking — rhythmic, low-frequency events
// ---------------------------------------------------------------------------

export function isSnoreCandidate(e: SoundEvent): boolean {
  const d = e.end - e.start;
  return d >= 0.3 && d <= 4 && e.lowRatio >= 0.55;
}

export interface SnoreEpisode {
  start: number;
  end: number;
  events: number;
}

export class SnoreTracker {
  private chain: SoundEvent[] = [];
  private current: SnoreEpisode | null = null;
  readonly episodes: SnoreEpisode[] = [];

  /** Returns 'started' when a new episode is confirmed. */
  push(e: SoundEvent): 'started' | 'continued' | null {
    if (!isSnoreCandidate(e)) return null;
    const last = this.chain.at(-1);
    const gap = last ? e.start - last.start : Infinity;
    if (gap >= 1.5 && gap <= 10) this.chain.push(e);
    else this.chain = [e];

    if (this.current && e.start - this.current.end <= 15) {
      this.current.end = e.end;
      this.current.events++;
      return 'continued';
    }
    if (this.chain.length >= 3) {
      this.current = { start: this.chain[0].start, end: e.end, events: this.chain.length };
      this.episodes.push(this.current);
      return 'started';
    }
    return null;
  }

  /** Close an episode after 15 s of no snore candidates. */
  tick(t: number) {
    if (this.current && t - this.current.end > 15) this.current = null;
  }

  get snoring() {
    return this.current != null;
  }

  /** Snore seconds per minute index, from episode spans. */
  secondsByMinute(): Map<number, number> {
    const out = new Map<number, number>();
    for (const ep of this.episodes) {
      let t = ep.start;
      while (t < ep.end) {
        const m = Math.floor(t / 60);
        const next = Math.min(ep.end, (m + 1) * 60);
        out.set(m, (out.get(m) ?? 0) + (next - t));
        t = next;
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Per-minute epochs
// ---------------------------------------------------------------------------

export class EpochAggregator {
  private acc = new Map<number, { sum: number; n: number; peak: number; events: number; mv: number; mn: number }>();

  constructor(private offsetMin = 0) {}

  private get(m: number) {
    let a = this.acc.get(m);
    if (!a) {
      a = { sum: 0, n: 0, peak: -Infinity, events: 0, mv: 0, mn: 0 };
      this.acc.set(m, a);
    }
    return a;
  }

  frame(t: number, db: number) {
    const a = this.get(this.offsetMin + Math.floor(t / 60));
    a.sum += db;
    a.n++;
    a.peak = Math.max(a.peak, db);
  }

  event(t: number) {
    this.get(this.offsetMin + Math.floor(t / 60)).events++;
  }

  motion(t: number, moving: boolean) {
    const a = this.get(this.offsetMin + Math.floor(t / 60));
    a.mn++;
    if (moving) a.mv++;
  }

  build(totalMin: number, snoreByMin: Map<number, number>, prior: SoundEpoch[] = []): SoundEpoch[] {
    const byM = new Map(prior.map((e) => [e.m, e]));
    for (let m = this.offsetMin; m < totalMin; m++) {
      const a = this.acc.get(m);
      const snore = Math.min(60, Math.round(snoreByMin.get(m - this.offsetMin) ?? 0));
      if (!a || a.n === 0) {
        if (!byM.has(m)) byM.set(m, { m, db: null, peak: null, snore: 0, events: 0, motion: null });
        continue;
      }
      byM.set(m, {
        m,
        db: round1(a.sum / a.n),
        peak: round1(a.peak),
        snore,
        events: a.events,
        motion: a.mn ? round2(a.mv / a.mn) : null,
      });
    }
    return [...byM.values()].sort((x, y) => x.m - y.m);
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Quiet floor of a night: 10th percentile of minute levels. */
export function nightFloor(epochs: SoundEpoch[]): number | null {
  const v = epochs.filter((e) => e.db != null).map((e) => e.db as number).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length * 0.1)] : null;
}

/** Recompute summary fields from epochs (used on finish and for resumed nights). */
export function summarize(rec: Omit<NightRecording, 'snoreMin' | 'floorDb' | 'peakAboveFloor' | 'gapsMin'>): NightRecording {
  const floor = nightFloor(rec.epochs);
  const peaks = rec.epochs.filter((e) => e.peak != null).map((e) => e.peak as number);
  return {
    ...rec,
    snoreMin: Math.round(rec.epochs.reduce((a, e) => a + e.snore, 0) / 60),
    floorDb: floor,
    peakAboveFloor: floor != null && peaks.length ? Math.round(Math.max(...peaks) - floor) : null,
    gapsMin: rec.epochs.filter((e) => e.db == null).length,
  };
}

// ---------------------------------------------------------------------------
// Restlessness estimate (NOT sleep stages)
// ---------------------------------------------------------------------------

export type RestState = 'calm' | 'restless' | 'awake' | 'gap';

export const REST_LABEL: Record<RestState, string> = {
  calm: 'Calm',
  restless: 'Restless',
  awake: 'Likely awake',
  gap: 'No data',
};

export interface RestEstimate {
  states: RestState[];
  calmMin: number;
  restlessMin: number;
  awakeMin: number;
  basis: 'motion+sound' | 'sound';
}

export function estimateRestlessness(epochs: SoundEpoch[]): RestEstimate {
  const hasMotion = epochs.some((e) => e.motion != null);
  const raw = epochs.map((e) => {
    if (e.db == null) return null;
    const motion = e.motion != null ? Math.min(1, e.motion / 0.15) : 0;
    const sound = Math.min(1, e.events * (hasMotion ? 0.12 : 0.25));
    return hasMotion ? motion * 0.75 + sound * 0.25 : sound;
  });
  // Centered moving average over 5 minutes.
  const smooth = raw.map((v, i) => {
    if (v == null) return null;
    const win = raw.slice(Math.max(0, i - 2), i + 3).filter((x): x is number => x != null);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });
  const states: RestState[] = smooth.map((v) => (v == null ? 'gap' : v >= 0.55 ? 'awake' : v >= 0.18 ? 'restless' : 'calm'));
  // "Likely awake" only when sustained ≥3 min; shorter bursts are restless.
  for (let i = 0; i < states.length; i++) {
    if (states[i] !== 'awake') continue;
    let j = i;
    while (j < states.length && states[j] === 'awake') j++;
    if (j - i < 3) for (let k = i; k < j; k++) states[k] = 'restless';
    i = j;
  }
  return {
    states,
    calmMin: states.filter((s) => s === 'calm').length,
    restlessMin: states.filter((s) => s === 'restless').length,
    awakeMin: states.filter((s) => s === 'awake').length,
    basis: hasMotion ? 'motion+sound' : 'sound',
  };
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export class MotionDetector {
  private last: [number, number, number] | null = null;
  constructor(private threshold = 0.12) {}
  /** Returns true when the change in acceleration indicates movement. */
  push(x: number, y: number, z: number): boolean {
    const prev = this.last;
    this.last = [x, y, z];
    if (!prev) return false;
    const d = Math.hypot(x - prev[0], y - prev[1], z - prev[2]);
    return d > this.threshold;
  }
}

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

/** Ring buffer of downsampled mono PCM. */
export class RingBuffer {
  private buf: Float32Array;
  private pos = 0;
  private filled = 0;
  constructor(readonly size: number) {
    this.buf = new Float32Array(size);
  }
  push(x: Float32Array) {
    for (let i = 0; i < x.length; i++) {
      this.buf[this.pos] = x[i];
      this.pos = (this.pos + 1) % this.size;
    }
    this.filled = Math.min(this.size, this.filled + x.length);
  }
  /** Most recent `n` samples in order. */
  tail(n: number): Float32Array {
    n = Math.min(n, this.filled);
    const out = new Float32Array(n);
    const start = (this.pos - n + this.size) % this.size;
    for (let i = 0; i < n; i++) out[i] = this.buf[(start + i) % this.size];
    return out;
  }
}

export function downsample(input: Float32Array, factor: number): Float32Array {
  const n = Math.floor(input.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += input[i * factor + k];
    out[i] = s / factor;
  }
  return out;
}

/** Encode mono float PCM as a 16-bit WAV blob, normalised for comfortable playback. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0 ? Math.min(20, 0.8 / peak) : 1;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * gain));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
