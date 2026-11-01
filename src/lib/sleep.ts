/**
 * Pure sleep calculations — no React, no storage. Everything here is
 * deterministic and derived only from what the user logged or imported.
 */
import type { JournalEntry, Settings, SleepRecord, StageKey } from '../data/types';
import {
  addDays,
  clockDiff,
  clockMinutesInZone,
  dateKeyInZone,
  diffDays,
  minutesBetween,
  normalizeClock,
  parseHHmm,
  toMorningAxis,
  toNightAxis,
  weekdayOf,
} from './time';

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

// ---------------------------------------------------------------------------
// Per-night metrics
// ---------------------------------------------------------------------------

export interface NightMetrics {
  record: SleepRecord;
  /** Local date of the wake-up, YYYY-MM-DD (the "night of" label). */
  dateKey: string;
  bedClock: number;
  wakeClock: number;
  /** Clock time the user fell asleep, when latency is known. */
  asleepClock: number | null;
  timeInBed: number;
  latency: number | null;
  awake: number | null;
  asleep: number;
  /** True when we know latency/awake/stages; otherwise asleep == time in bed. */
  hasSleepDetail: boolean;
  efficiency: number | null;
  goalDiff: number;
  metGoal: boolean;
  hasStages: boolean;
}

export function computeMetrics(record: SleepRecord, goalMin: number): NightMetrics {
  const tz = record.timezone;
  const timeInBed = Math.max(0, minutesBetween(record.bedtime, record.wakeTime));
  const latency = record.latencyMin ?? null;
  let awake = record.awakeMin ?? null;
  const st = record.stages;
  const hasStages = !!st && st.rem + st.light + st.deep > 0;

  let asleep: number;
  if (hasStages && st) {
    asleep = st.rem + st.light + st.deep;
    if (awake == null) awake = st.awake;
  } else {
    asleep = timeInBed - (latency ?? 0) - (awake ?? 0);
  }
  asleep = clamp(asleep, 0, timeInBed);
  const hasSleepDetail = hasStages || latency != null || awake != null;
  const efficiency = hasSleepDetail && timeInBed > 0 ? (asleep / timeInBed) * 100 : null;
  const bedClock = clockMinutesInZone(record.bedtime, tz);

  return {
    record,
    dateKey: dateKeyInZone(record.wakeTime, tz),
    bedClock,
    wakeClock: clockMinutesInZone(record.wakeTime, tz),
    asleepClock: latency != null ? normalizeClock(bedClock + latency) : null,
    timeInBed,
    latency,
    awake,
    asleep,
    hasSleepDetail,
    efficiency,
    goalDiff: asleep - goalMin,
    metGoal: asleep >= goalMin - 5, // 5-minute grace
    hasStages,
  };
}

// ---------------------------------------------------------------------------
// Sleep Score — transparent, weighted, non-medical
// ---------------------------------------------------------------------------

export type ScoreFactorKey = 'duration' | 'efficiency' | 'consistency' | 'quality';

export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  weight: number;
  /** 0–1 sub-score, null when the input was not provided. */
  value: number | null;
  /** Points contributed after re-weighting (sum == total score). */
  points: number;
  maxPoints: number;
  detail: string;
}

export interface SleepScore {
  total: number;
  factors: ScoreFactor[];
  label: string;
}

export const SCORE_WEIGHTS: Record<ScoreFactorKey, number> = {
  duration: 40,
  efficiency: 20,
  consistency: 20,
  quality: 20,
};

export function durationSubscore(asleep: number, goal: number): number {
  if (goal <= 0) return 0;
  const ratio = asleep / goal;
  if (ratio < 1) return clamp((ratio - 0.4) / 0.6);
  // Gentle penalty for sleeping far beyond goal (>2h over).
  const over = asleep - goal;
  if (over <= 120) return 1;
  return clamp(1 - (over - 120) / 600, 0.7, 1);
}

export function efficiencySubscore(eff: number): number {
  return clamp((eff - 65) / 25); // 65% → 0, 90%+ → 1
}

export function deviationSubscore(devMin: number): number {
  return clamp(1 - (devMin - 15) / 105); // ≤15 min → 1, ≥120 min → 0
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  return 'Needs attention';
}

export interface ConsistencyRef {
  bed: number;
  wake: number;
  basis: 'history' | 'targets';
  nights: number;
}

/** Reference schedule for a night: mean of up to 7 prior nights (last 14 days), else targets. */
export function consistencyReference(
  night: NightMetrics,
  prior: NightMetrics[],
  settings: Settings,
): ConsistencyRef {
  const window = prior
    .filter((n) => {
      const d = diffDays(night.dateKey, n.dateKey);
      return d >= 1 && d <= 14;
    })
    .slice(-7);
  if (window.length >= 3) {
    return {
      bed: normalizeClock(mean(window.map((n) => toNightAxis(n.bedClock)))),
      wake: normalizeClock(mean(window.map((n) => toMorningAxis(n.wakeClock)))),
      basis: 'history',
      nights: window.length,
    };
  }
  return {
    bed: parseHHmm(settings.targetBedtime),
    wake: parseHHmm(settings.targetWake),
    basis: 'targets',
    nights: window.length,
  };
}

export function computeScore(
  night: NightMetrics,
  prior: NightMetrics[],
  settings: Settings,
): SleepScore {
  const ref = consistencyReference(night, prior, settings);
  const bedDev = Math.abs(clockDiff(night.bedClock, ref.bed));
  const wakeDev = Math.abs(clockDiff(night.wakeClock, ref.wake));
  const dev = (bedDev + wakeDev) / 2;
  const q = night.record.quality;

  const raw: Omit<ScoreFactor, 'points' | 'maxPoints'>[] = [
    {
      key: 'duration',
      label: 'Duration',
      weight: SCORE_WEIGHTS.duration,
      value: durationSubscore(night.asleep, settings.goalMin),
      detail: `${Math.round((night.asleep / settings.goalMin) * 100)}% of your ${fmtH(settings.goalMin)} goal`,
    },
    {
      key: 'efficiency',
      label: 'Efficiency',
      weight: SCORE_WEIGHTS.efficiency,
      value: night.efficiency != null ? efficiencySubscore(night.efficiency) : null,
      detail:
        night.efficiency != null
          ? `${Math.round(night.efficiency)}% of time in bed asleep`
          : 'Add time to fall asleep / awake time to include',
    },
    {
      key: 'consistency',
      label: 'Consistency',
      weight: SCORE_WEIGHTS.consistency,
      value: deviationSubscore(dev),
      detail:
        ref.basis === 'history'
          ? `Avg. ${Math.round(dev)} min from your ${ref.nights}-night routine`
          : `Avg. ${Math.round(dev)} min from your target schedule`,
    },
    {
      key: 'quality',
      label: 'How it felt',
      weight: SCORE_WEIGHTS.quality,
      value: q != null ? clamp((q - 1) / 4) : null,
      detail: q != null ? `You rated it ${q}/5` : 'Rate your night to include',
    },
  ];

  const available = raw.filter((f) => f.value != null);
  const totalWeight = available.reduce((a, f) => a + f.weight, 0) || 1;
  const factors: ScoreFactor[] = raw.map((f) => {
    const maxPoints = f.value == null ? 0 : (f.weight / totalWeight) * 100;
    return { ...f, maxPoints, points: f.value == null ? 0 : f.value * maxPoints };
  });
  const total = Math.round(factors.reduce((a, f) => a + f.points, 0));
  return { total, factors, label: scoreLabel(total) };
}

function fmtH(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Analysis of all nights
// ---------------------------------------------------------------------------

export interface Night extends NightMetrics {
  score: SleepScore;
  /** True for the main sleep of its date (longest); naps are secondary. */
  primary: boolean;
}

/** Analyse all records. Returns nights sorted by wake time ascending. */
export function analyzeNights(records: SleepRecord[], settings: Settings): Night[] {
  const metrics = records
    .map((r) => computeMetrics(r, settings.goalMin))
    .sort((a, b) => a.record.wakeTime.localeCompare(b.record.wakeTime));

  // Mark primary per date (longest time asleep).
  const bestByDate = new Map<string, NightMetrics>();
  for (const m of metrics) {
    const cur = bestByDate.get(m.dateKey);
    if (!cur || m.asleep > cur.asleep) bestByDate.set(m.dateKey, m);
  }
  const primaries: NightMetrics[] = [];
  const out: Night[] = [];
  for (const m of metrics) {
    const primary = bestByDate.get(m.dateKey) === m;
    const score = computeScore(m, primaries, settings);
    out.push({ ...m, score, primary });
    if (primary) primaries.push(m);
  }
  return out;
}

export const primaryNights = (nights: Night[]) => nights.filter((n) => n.primary);

export function nightsInRange(nights: Night[], endKey: string, days: number): Night[] {
  return nights.filter((n) => {
    const d = diffDays(endKey, n.dateKey);
    return n.primary && d >= 0 && d < days;
  });
}

// ---------------------------------------------------------------------------
// Range statistics
// ---------------------------------------------------------------------------

export interface RangeStats {
  days: number;
  logged: number;
  avgAsleep: number | null;
  avgInBed: number | null;
  totalAsleep: number;
  avgEfficiency: number | null;
  avgScore: number | null;
  avgQuality: number | null;
  avgBed: number | null;
  avgWake: number | null;
  bedSd: number | null;
  wakeSd: number | null;
  consistency: number | null;
  goalNights: number;
  goalCompletion: number | null;
  best: Night | null;
  worst: Night | null;
  longest: Night | null;
  shortest: Night | null;
}

/** 0–100: 100 when bed & wake times never vary; 0 at ~90 min standard deviation. */
export function consistencyFromSd(bedSd: number, wakeSd: number): number {
  return Math.round(clamp(1 - (bedSd + wakeSd) / 2 / 90) * 100);
}

export function rangeStats(nights: Night[], endKey: string, days: number): RangeStats {
  const ns = nightsInRange(nights, endKey, days);
  const n = ns.length;
  const effs = ns.filter((x) => x.efficiency != null).map((x) => x.efficiency as number);
  const quals = ns.filter((x) => x.record.quality != null).map((x) => x.record.quality as number);
  const beds = ns.map((x) => toNightAxis(x.bedClock));
  const wakes = ns.map((x) => toMorningAxis(x.wakeClock));
  const bedSd = n >= 2 ? stdev(beds) : null;
  const wakeSd = n >= 2 ? stdev(wakes) : null;
  const by = (f: (x: Night) => number, dir: 1 | -1) =>
    n ? ns.reduce((a, b) => (dir * (f(b) - f(a)) > 0 ? b : a)) : null;
  const goalNights = ns.filter((x) => x.metGoal).length;
  return {
    days,
    logged: n,
    avgAsleep: n ? mean(ns.map((x) => x.asleep)) : null,
    avgInBed: n ? mean(ns.map((x) => x.timeInBed)) : null,
    totalAsleep: ns.reduce((a, x) => a + x.asleep, 0),
    avgEfficiency: effs.length ? mean(effs) : null,
    avgScore: n ? mean(ns.map((x) => x.score.total)) : null,
    avgQuality: quals.length ? mean(quals) : null,
    avgBed: n ? normalizeClock(mean(beds)) : null,
    avgWake: n ? normalizeClock(mean(wakes)) : null,
    bedSd,
    wakeSd,
    consistency: bedSd != null && wakeSd != null && n >= 3 ? consistencyFromSd(bedSd, wakeSd) : null,
    goalNights,
    goalCompletion: n ? (goalNights / n) * 100 : null,
    best: by((x) => x.score.total, 1),
    worst: by((x) => x.score.total, -1),
    longest: by((x) => x.asleep, 1),
    shortest: by((x) => x.asleep, -1),
  };
}

// ---------------------------------------------------------------------------
// Sleep debt, streaks, weekly goal
// ---------------------------------------------------------------------------

export interface SleepDebt {
  minutes: number;
  nights: number;
  windowDays: number;
}

/**
 * Sleep debt over the last 14 days: sum of (goal − asleep) across logged nights.
 * Extra sleep repays debt, capped at 60 min per night. Unlogged nights are ignored.
 */
export function sleepDebt(nights: Night[], endKey: string, goal: number, windowDays = 14): SleepDebt {
  const ns = nightsInRange(nights, endKey, windowDays).slice().sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  let debt = 0;
  for (const n of ns) {
    const diff = goal - n.asleep;
    debt = Math.max(0, debt + (diff > 0 ? diff : Math.max(diff, -60)));
  }
  return { minutes: debt, nights: ns.length, windowDays };
}

export interface Streaks {
  goalCurrent: number;
  goalBest: number;
  loggingCurrent: number;
}

export function streaks(nights: Night[], today: string): Streaks {
  const ps = primaryNights(nights);
  const byDate = new Map(ps.map((n) => [n.dateKey, n]));
  // Current streaks may start today or yesterday (today's night may not be logged yet).
  const start = byDate.has(today) ? today : addDays(today, -1);
  let goalCurrent = 0;
  let loggingCurrent = 0;
  for (let k = start, goalAlive = true; byDate.has(k); k = addDays(k, -1)) {
    loggingCurrent++;
    if (goalAlive && byDate.get(k)!.metGoal) goalCurrent++;
    else goalAlive = false;
  }
  let goalBest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const n of ps) {
    const consecutive = prev != null && diffDays(n.dateKey, prev) === 1;
    run = n.metGoal ? (consecutive ? run + 1 : 1) : 0;
    goalBest = Math.max(goalBest, run);
    prev = n.dateKey;
  }
  return { goalCurrent, goalBest, loggingCurrent };
}

/** Monday of the ISO week containing `key`. */
export function weekStart(key: string): string {
  const wd = weekdayOf(key);
  return addDays(key, -((wd + 6) % 7));
}

export function weeklyGoalProgress(nights: Night[], today: string) {
  const start = weekStart(today);
  const ns = primaryNights(nights).filter((n) => n.dateKey >= start && n.dateKey <= today);
  return { met: ns.filter((n) => n.metGoal).length, logged: ns.length, start };
}

// ---------------------------------------------------------------------------
// Schedule recommendations
// ---------------------------------------------------------------------------

export interface ScheduleInfo {
  recommendedBed: number;
  recommendedWake: number;
  latencyUsed: number;
  latencyFromData: boolean;
  lastBedDiff: number | null;
  lastWakeDiff: number | null;
  consistency: number | null;
}

export function scheduleInfo(nights: Night[], settings: Settings, today: string): ScheduleInfo {
  const recent = nightsInRange(nights, today, 14);
  const lats = recent.filter((n) => n.latency != null).map((n) => n.latency as number);
  const latencyFromData = lats.length >= 3;
  const latencyUsed = latencyFromData ? Math.round(mean(lats)) : 15;
  const wake = parseHHmm(settings.targetWake);
  const last = primaryNights(nights).at(-1) ?? null;
  const week = rangeStats(nights, today, 7);
  return {
    recommendedBed: normalizeClock(wake - settings.goalMin - latencyUsed),
    recommendedWake: wake,
    latencyUsed,
    latencyFromData,
    lastBedDiff: last ? clockDiff(last.bedClock, parseHHmm(settings.targetBedtime)) : null,
    lastWakeDiff: last ? clockDiff(last.wakeClock, wake) : null,
    consistency: week.consistency,
  };
}

// ---------------------------------------------------------------------------
// Journal ↔ sleep patterns (associations only, never causation)
// ---------------------------------------------------------------------------

export interface HabitPattern {
  key: string;
  label: string;
  withN: number;
  withoutN: number;
  scoreWith: number;
  scoreWithout: number;
  asleepWith: number;
  asleepWithout: number;
  scoreDelta: number;
  asleepDelta: number;
}

interface HabitDef {
  key: string;
  label: string;
  test: (e: JournalEntry) => boolean | null;
}

export const HABITS: HabitDef[] = [
  { key: 'exercise', label: 'Exercise', test: (e) => (e.exercise == null ? null : e.exercise) },
  { key: 'caffeine', label: 'Any caffeine', test: (e) => (e.caffeine == null ? null : e.caffeine > 0) },
  {
    key: 'lateCaffeine',
    label: 'Caffeine after 2 pm',
    test: (e) =>
      e.caffeine == null ? null : e.caffeine > 0 && !!e.lastCaffeine && parseHHmm(e.lastCaffeine) >= 14 * 60,
  },
  { key: 'highStress', label: 'High stress (4–5)', test: (e) => (e.stress == null ? null : e.stress >= 4) },
  { key: 'alcohol', label: 'Alcohol', test: (e) => e.tags.includes('alcohol') },
  { key: 'lateMeal', label: 'Late meal', test: (e) => e.tags.includes('lateMeal') },
  { key: 'screens', label: 'Screens before bed', test: (e) => e.tags.includes('screens') },
  { key: 'nap', label: 'Daytime nap', test: (e) => e.tags.includes('nap') },
  { key: 'meditation', label: 'Meditation', test: (e) => e.tags.includes('meditation') },
  { key: 'reading', label: 'Reading', test: (e) => e.tags.includes('reading') },
];

export const MIN_PATTERN_SAMPLES = 3;

/**
 * Daytime habits on date D are paired with the night that ends on D+1.
 * Returns comparisons only where both groups have ≥3 nights.
 */
export function habitPatterns(nights: Night[], journal: JournalEntry[]): HabitPattern[] {
  const byDate = new Map(primaryNights(nights).map((n) => [n.dateKey, n]));
  const out: HabitPattern[] = [];
  for (const h of HABITS) {
    const withN: Night[] = [];
    const without: Night[] = [];
    for (const e of journal) {
      const night = byDate.get(addDays(e.date, 1));
      if (!night) continue;
      const v = h.test(e);
      if (v == null) continue;
      (v ? withN : without).push(night);
    }
    if (withN.length < MIN_PATTERN_SAMPLES || without.length < MIN_PATTERN_SAMPLES) continue;
    const sw = mean(withN.map((n) => n.score.total));
    const so = mean(without.map((n) => n.score.total));
    const aw = mean(withN.map((n) => n.asleep));
    const ao = mean(without.map((n) => n.asleep));
    out.push({
      key: h.key,
      label: h.label,
      withN: withN.length,
      withoutN: without.length,
      scoreWith: sw,
      scoreWithout: so,
      asleepWith: aw,
      asleepWithout: ao,
      scoreDelta: sw - so,
      asleepDelta: aw - ao,
    });
  }
  return out.sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta));
}

/** Morning feelings on D vs the night that ended on D. */
export function restedVsSleep(nights: Night[], journal: JournalEntry[]) {
  const byDate = new Map(primaryNights(nights).map((n) => [n.dateKey, n]));
  const pairs = journal
    .filter((e) => e.rested != null && byDate.has(e.date))
    .map((e) => ({ rested: e.rested as number, night: byDate.get(e.date)! }));
  if (pairs.length < 4) return null;
  const goalMet = pairs.filter((p) => p.night.metGoal);
  const goalMissed = pairs.filter((p) => !p.night.metGoal);
  if (goalMet.length < 2 || goalMissed.length < 2) return null;
  return {
    restedMet: mean(goalMet.map((p) => p.rested)),
    restedMissed: mean(goalMissed.map((p) => p.rested)),
    nMet: goalMet.length,
    nMissed: goalMissed.length,
  };
}

// ---------------------------------------------------------------------------
// Weekday pattern & personal insights
// ---------------------------------------------------------------------------

export function weekdayAverages(nights: Night[], endKey: string, days: number) {
  const ns = nightsInRange(nights, endKey, days);
  return Array.from({ length: 7 }, (_, wd) => {
    const g = ns.filter((n) => weekdayOf(n.dateKey) === wd);
    return { weekday: wd, n: g.length, avgAsleep: g.length ? mean(g.map((x) => x.asleep)) : null };
  });
}

export interface Insight {
  id: string;
  tone: 'positive' | 'neutral' | 'attention';
  title: string;
  body: string;
}

export function buildInsights(
  nights: Night[],
  journal: JournalEntry[],
  settings: Settings,
  today: string,
): Insight[] {
  const out: Insight[] = [];
  const week = rangeStats(nights, today, 7);
  const prevWeek = rangeStats(nights, addDays(today, -7), 7);
  const goal = settings.goalMin;

  if (week.logged >= 3 && week.avgAsleep != null) {
    const d = week.avgAsleep - goal;
    out.push(
      d >= -10
        ? {
            id: 'avg-goal',
            tone: 'positive',
            title: 'On track with your goal',
            body: `You averaged ${fmtHM(week.avgAsleep)} over your last ${week.logged} logged nights — right around your ${fmtH(goal)} goal.`,
          }
        : {
            id: 'avg-goal',
            tone: 'attention',
            title: `About ${fmtHM(-d)} short per night`,
            body: `Your 7-day average is ${fmtHM(week.avgAsleep)}. Getting to bed ${Math.min(60, Math.round(-d / 5) * 5)} minutes earlier would close most of the gap.`,
          },
    );
  }

  if (week.logged >= 3 && prevWeek.logged >= 3 && week.avgBed != null && prevWeek.avgBed != null) {
    const shift = clockDiff(week.avgBed, prevWeek.avgBed);
    if (Math.abs(shift) >= 20) {
      out.push({
        id: 'bed-shift',
        tone: shift > 0 ? 'attention' : 'neutral',
        title: `Bedtime ${shift > 0 ? 'drifted later' : 'moved earlier'}`,
        body: `Your average bedtime is ${Math.abs(Math.round(shift))} minutes ${shift > 0 ? 'later' : 'earlier'} than the week before.`,
      });
    }
  }

  const month = nightsInRange(nights, today, 30);
  const weekend = month.filter((n) => [0, 6].includes(weekdayOf(n.dateKey)));
  const weekday = month.filter((n) => ![0, 6].includes(weekdayOf(n.dateKey)));
  if (weekend.length >= 2 && weekday.length >= 4) {
    const wk = mean(weekend.map((n) => toMorningAxis(n.wakeClock)));
    const wd = mean(weekday.map((n) => toMorningAxis(n.wakeClock)));
    const diff = wk - wd;
    if (Math.abs(diff) >= 45) {
      out.push({
        id: 'social-jetlag',
        tone: 'attention',
        title: 'Weekend wake-ups differ',
        body: `On weekends you wake about ${fmtHM(Math.abs(diff))} ${diff > 0 ? 'later' : 'earlier'} than on weekdays. A steadier wake time tends to make Mondays easier.`,
      });
    } else {
      out.push({
        id: 'steady-weekends',
        tone: 'positive',
        title: 'Steady across the week',
        body: `Your weekend and weekday wake times are within ${Math.round(Math.abs(diff))} minutes of each other.`,
      });
    }
  }

  if (week.avgEfficiency != null && week.avgEfficiency < 85) {
    out.push({
      id: 'efficiency',
      tone: 'neutral',
      title: 'Time in bed vs. time asleep',
      body: `Recently ${Math.round(week.avgEfficiency)}% of your time in bed was spent asleep. Many people aim for 85% or more.`,
    });
  }

  const pats = habitPatterns(nights, journal);
  if (pats[0] && Math.abs(pats[0].scoreDelta) >= 4) {
    const p = pats[0];
    out.push({
      id: 'pattern',
      tone: 'neutral',
      title: `Pattern: ${p.label.toLowerCase()}`,
      body: `Nights after days with ${p.label.toLowerCase()} averaged a score ${Math.abs(Math.round(p.scoreDelta))} points ${p.scoreDelta > 0 ? 'higher' : 'lower'} (${p.withN} vs ${p.withoutN} nights). This is an association, not proof of cause.`,
    });
  }

  if (!out.length) {
    out.push({
      id: 'getting-started',
      tone: 'neutral',
      title: 'Insights unlock as you log',
      body: 'Log at least three nights to see averages, schedule patterns and personalised observations.',
    });
  }
  return out;
}

function fmtHM(min: number) {
  const t = Math.round(Math.abs(min));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export const STAGE_ORDER: StageKey[] = ['awake', 'rem', 'light', 'deep'];
export const STAGE_LABEL: Record<StageKey, string> = {
  awake: 'Awake',
  rem: 'REM',
  light: 'Light',
  deep: 'Deep',
};

export function stagePercentages(st: NonNullable<SleepRecord['stages']>) {
  const total = st.awake + st.rem + st.light + st.deep;
  return STAGE_ORDER.map((k) => ({
    key: k,
    minutes: st[k],
    pct: total ? (st[k] / total) * 100 : 0,
  }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateRecord(input: {
  bedtime: Date;
  wakeTime: Date;
  latencyMin?: number | null;
  awakeMin?: number | null;
  stages?: SleepRecord['stages'];
}): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tib = minutesBetween(input.bedtime, input.wakeTime);
  if (!Number.isFinite(tib)) errors.push('Please enter valid times.');
  else if (tib <= 0) errors.push('Wake-up time must be after bedtime.');
  else if (tib > 20 * 60) errors.push('A single sleep can’t be longer than 20 hours.');
  else if (tib > 14 * 60) warnings.push('That’s a long time in bed — double-check the times.');
  if (input.wakeTime.getTime() > Date.now() + 5 * 60_000) errors.push('Wake-up time is in the future.');
  const used = (input.latencyMin ?? 0) + (input.awakeMin ?? 0);
  if (tib > 0 && used >= tib) errors.push('Time to fall asleep plus awake time exceeds time in bed.');
  if (input.stages) {
    const s = input.stages;
    const sum = s.awake + s.rem + s.light + s.deep;
    if ([s.awake, s.rem, s.light, s.deep].some((v) => v < 0)) errors.push('Stage minutes can’t be negative.');
    if (sum > tib + 1) errors.push(`Stage minutes (${Math.round(sum)}) exceed time in bed (${Math.round(tib)}).`);
  }
  return { errors, warnings };
}
