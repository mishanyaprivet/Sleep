import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type SleepRecord } from '../../data/types';
import {
  analyzeNights, computeMetrics, computeScore, consistencyFromSd, durationSubscore, rangeStats,
  sleepDebt, streaks, validateRecord,
} from '../sleep';
import {
  addDays, clockDiff, clockMinutesInZone, dateKeyInZone, formatDuration, resolveNight, toNightAxis, zonedDateTime,
} from '../time';
import { csvToRecords, recordsToCsv } from '../../data/csv';

const TZ = 'Europe/Berlin';
let n = 0;
function rec(wakeDate: string, bed: string, wake: string, extra: Partial<SleepRecord> = {}, tz = TZ): SleepRecord {
  const r = resolveNight(wakeDate, bed, wake, tz);
  return {
    id: `r${n++}`, bedtime: r.bedtime.toISOString(), wakeTime: r.wakeTime.toISOString(), timezone: tz,
    source: 'manual', createdAt: '', updatedAt: '', ...extra,
  };
}

describe('time', () => {
  it('converts zoned wall time to instants', () => {
    expect(zonedDateTime('2026-01-15', '23:00', TZ).toISOString()).toBe('2026-01-15T22:00:00.000Z');
    expect(zonedDateTime('2026-07-15', '23:00', TZ).toISOString()).toBe('2026-07-15T21:00:00.000Z');
    expect(zonedDateTime('2026-07-15', '07:30', 'America/New_York').toISOString()).toBe('2026-07-15T11:30:00.000Z');
  });
  it('resolves nights across midnight', () => {
    const { bedtime, wakeTime } = resolveNight('2026-03-10', '23:30', '07:00', TZ);
    expect((wakeTime.getTime() - bedtime.getTime()) / 60000).toBe(450);
    expect(dateKeyInZone(bedtime, TZ)).toBe('2026-03-09');
  });
  it('keeps same-day nights after midnight', () => {
    const { bedtime, wakeTime } = resolveNight('2026-03-10', '00:45', '08:15', TZ);
    expect((wakeTime.getTime() - bedtime.getTime()) / 60000).toBe(450);
    expect(dateKeyInZone(bedtime, TZ)).toBe('2026-03-10');
  });
  it('handles DST spring-forward night (one hour shorter)', () => {
    // Europe/Berlin springs forward 2026-03-29 02:00 → 03:00
    const { bedtime, wakeTime } = resolveNight('2026-03-29', '23:00', '07:00', TZ);
    expect((wakeTime.getTime() - bedtime.getTime()) / 60000).toBe(420);
  });
  it('handles DST fall-back night (one hour longer)', () => {
    const { bedtime, wakeTime } = resolveNight('2026-10-25', '23:00', '07:00', TZ);
    expect((wakeTime.getTime() - bedtime.getTime()) / 60000).toBe(540);
  });
  it('clock helpers', () => {
    expect(clockDiff(30, 1410)).toBe(60);
    expect(clockDiff(1410, 30)).toBe(-60);
    expect(toNightAxis(60)).toBe(1500);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(formatDuration(462)).toBe('7h 42m');
    expect(clockMinutesInZone('2026-01-15T22:00:00Z', TZ)).toBe(1380);
  });
});

describe('metrics', () => {
  it('computes time in bed, asleep and efficiency', () => {
    const m = computeMetrics(rec('2026-03-10', '23:00', '07:00', { latencyMin: 20, awakeMin: 25 }), 480);
    expect(m.timeInBed).toBe(480);
    expect(m.asleep).toBe(435);
    expect(m.efficiency).toBeCloseTo(90.625);
    expect(m.goalDiff).toBe(-45);
    expect(m.dateKey).toBe('2026-03-10');
    expect(m.asleepClock).toBe(1400);
  });
  it('has no efficiency without detail', () => {
    const m = computeMetrics(rec('2026-03-10', '23:00', '07:00'), 480);
    expect(m.efficiency).toBeNull();
    expect(m.asleep).toBe(480);
    expect(m.metGoal).toBe(true);
  });
  it('uses stages when present', () => {
    const m = computeMetrics(
      rec('2026-03-10', '23:00', '07:00', { stages: { awake: 40, rem: 100, light: 240, deep: 100, source: 'manual' } }),
      480,
    );
    expect(m.asleep).toBe(440);
    expect(m.awake).toBe(40);
    expect(m.efficiency).toBeCloseTo(91.667, 2);
  });
});

describe('score', () => {
  it('duration subscore', () => {
    expect(durationSubscore(480, 480)).toBe(1);
    expect(durationSubscore(192, 480)).toBe(0);
    expect(durationSubscore(420, 480)).toBeCloseTo(0.7917, 3);
  });
  it('reweights missing factors and sums to total', () => {
    const settings = { ...DEFAULT_SETTINGS, targetBedtime: '23:00', targetWake: '07:00' };
    const m = computeMetrics(rec('2026-03-10', '23:00', '07:00'), 480);
    const s = computeScore(m, [], settings);
    expect(s.total).toBe(100); // perfect duration + perfect consistency w/ targets
    expect(s.factors.find((f) => f.key === 'quality')!.maxPoints).toBe(0);
    const sum = s.factors.reduce((a, f) => a + f.maxPoints, 0);
    expect(sum).toBeCloseTo(100);
  });
  it('quality lowers score', () => {
    const m = computeMetrics(rec('2026-03-10', '23:00', '07:00', { quality: 1 }), 480);
    const s = computeScore(m, [], DEFAULT_SETTINGS);
    expect(s.total).toBe(75); // efficiency unknown → quality weighs 25 of 100
  });
});

describe('ranges', () => {
  const settings = { ...DEFAULT_SETTINGS };
  const records = [
    rec('2026-03-01', '23:00', '07:00'),
    rec('2026-03-02', '23:30', '06:30'),
    rec('2026-03-03', '00:30', '07:00'),
    rec('2026-03-04', '23:00', '07:30'),
    rec('2026-03-04', '14:00', '14:40'), // nap — not primary
  ];
  const nights = analyzeNights(records, settings);
  it('marks naps as non-primary', () => {
    expect(nights.filter((x) => x.primary)).toHaveLength(4);
  });
  it('averages bedtime across midnight', () => {
    const st = rangeStats(nights, '2026-03-04', 7);
    expect(st.logged).toBe(4);
    expect(st.avgBed).toBe(1410 + 0); // (1380+1410+1470+1380)/4 = 1410 → 23:30
    expect(st.avgAsleep).toBeCloseTo((480 + 420 + 390 + 510) / 4);
    expect(st.longest!.asleep).toBe(510);
    expect(st.shortest!.asleep).toBe(390);
    expect(st.goalNights).toBe(2);
  });
  it('sleep debt with capped repayment', () => {
    const d = sleepDebt(nights, '2026-03-04', 480);
    // 0, +60, +90 → 150, then −30 → 120
    expect(d.minutes).toBe(120);
  });
  it('streaks', () => {
    const s = streaks(nights, '2026-03-04');
    expect(s.loggingCurrent).toBe(4);
    expect(s.goalCurrent).toBe(1);
    expect(s.goalBest).toBe(1);
  });
  it('consistency from sd', () => {
    expect(consistencyFromSd(0, 0)).toBe(100);
    expect(consistencyFromSd(90, 90)).toBe(0);
  });
});

describe('validation & csv', () => {
  it('validates', () => {
    const b = new Date('2026-03-01T22:00:00Z');
    expect(validateRecord({ bedtime: b, wakeTime: b }).errors.length).toBe(1);
    expect(validateRecord({ bedtime: b, wakeTime: new Date('2026-03-02T06:00:00Z'), latencyMin: 300, awakeMin: 200 }).errors.length).toBe(1);
  });
  it('round-trips csv', () => {
    const r = rec('2026-03-10', '23:00', '07:00', { latencyMin: 10, notes: 'Hello, "world"', stages: { awake: 20, rem: 90, light: 250, deep: 110, source: 'import', device: 'Ring' } });
    const csv = recordsToCsv([r], [], 480);
    const { records } = csvToRecords(csv);
    expect(records).toHaveLength(1);
    expect(records[0].bedtime).toBe(r.bedtime);
    expect(records[0].notes).toBe('Hello, "world"');
    expect(records[0].stages?.deep).toBe(110);
    expect(records[0].stages?.device).toBe('Ring');
  });
});
