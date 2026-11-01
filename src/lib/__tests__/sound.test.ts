import { describe, expect, it } from 'vitest';
import {
  EpochAggregator, EventDetector, FRAME_SEC, NoiseFloor, SnoreTracker, encodeWav, estimateRestlessness, summarize,
} from '../soundAnalysis';
import type { SoundEpoch } from '../../data/types';

/** Simulate frames: level dB at time t and low-band ratio. */
function run(seconds: number, level: (t: number) => number, low: (t: number) => number) {
  const floor = new NoiseFloor();
  const det = new EventDetector(10);
  const snore = new SnoreTracker();
  const agg = new EpochAggregator();
  const events = [];
  let started = 0;
  for (let i = 0; i < seconds / FRAME_SEC; i++) {
    const t = i * FRAME_SEC;
    const db = level(t);
    const f = floor.update(db);
    agg.frame(t, db);
    const e = det.push(t, db - f, low(t));
    if (e) {
      events.push(e);
      agg.event(t);
      if (snore.push(e) === 'started') started++;
    }
    snore.tick(t);
  }
  return { floor, events, snore, started, agg };
}

describe('sound analysis', () => {
  it('detects rhythmic low-frequency snoring', () => {
    // quiet −60 dB; 1.2 s snore bursts at −40 dB every 4 s starting at 10 s
    const burst = (t: number) => t > 10 && (t - 10) % 4 < 1.2;
    const r = run(120, (t) => (burst(t) ? -40 : -60), (t) => (burst(t) ? 0.8 : 0.3));
    expect(r.started).toBe(1);
    expect(r.snore.episodes[0].events).toBeGreaterThan(20);
    const byMin = r.snore.secondsByMinute();
    expect((byMin.get(0) ?? 0) + (byMin.get(1) ?? 0)).toBeGreaterThan(90);
  });

  it('does not flag high-frequency noise as snoring', () => {
    const burst = (t: number) => t > 10 && (t - 10) % 4 < 1.2;
    const r = run(120, (t) => (burst(t) ? -40 : -60), () => 0.2);
    expect(r.events.length).toBeGreaterThan(20);
    expect(r.started).toBe(0);
  });

  it('ignores a quiet room', () => {
    const r = run(60, () => -60 + Math.sin(Date.now()) * 0.5, () => 0.3);
    expect(r.events.length).toBe(0);
  });

  it('builds epochs with gaps and summary', () => {
    const agg = new EpochAggregator();
    for (let t = 0; t < 60; t += FRAME_SEC) agg.frame(t, -50);
    for (let t = 120; t < 180; t += FRAME_SEC) agg.frame(t, -40);
    const ep = agg.build(3, new Map([[2, 30]]));
    expect(ep.map((e) => e.db)).toEqual([-50, null, -40]);
    const s = summarize({ startedAt: '', endedAt: '', epochs: ep, snoreEpisodes: 1, noiseEvents: 0, motionAvailable: false, clips: [], sensitivity: 'medium' });
    expect(s.gapsMin).toBe(1);
    expect(s.peakAboveFloor).toBe(10);
  });

  it('estimates restlessness only when sustained', () => {
    const mk = (motion: number): SoundEpoch => ({ m: 0, db: -50, peak: -45, snore: 0, events: 0, motion });
    const epochs = [...Array(10)].map(() => mk(0)).concat([...Array(6)].map(() => mk(0.5))).concat([...Array(10)].map(() => mk(0)));
    const r = estimateRestlessness(epochs);
    expect(r.basis).toBe('motion+sound');
    expect(r.awakeMin).toBeGreaterThanOrEqual(3);
    expect(r.calmMin).toBeGreaterThan(10);
  });

  it('encodes wav', () => {
    const b = encodeWav(new Float32Array(1200), 12000);
    expect(b.size).toBe(44 + 2400);
  });
});
