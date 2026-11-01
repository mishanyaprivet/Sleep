import { useMemo } from 'react';
import {
  AlarmClock,
  BedDouble,
  CalendarClock,
  ChevronRight,
  Flame,
  Info,
  Layers,
  Lightbulb,
  Moon as MoonIcon,
  Plus,
  Sparkles,
  Sunrise,
  Target,
  TrendingDown,
  X,
} from 'lucide-react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useClock } from '../state/format';
import { Card, CardHeader, Button, Delta, EmptyState, IconButton, ProgressBar, cx } from '../components/ui';
import { Ring } from '../components/charts';
import { Moon, StarField } from '../components/Illustrations';
import { SleepTimeline, StagesView } from '../components/NightViews';
import {
  buildInsights,
  primaryNights,
  rangeStats,
  scheduleInfo,
  sleepDebt,
  streaks,
  weeklyGoalProgress,
} from '../lib/sleep';
import {
  clockMinutesInZone,
  deviceTimeZone,
  formatDateKey,
  formatDuration,
  normalizeClock,
  parseHHmm,
  relativeDayLabel,
  signedMinutes,
} from '../lib/time';
import { unlockAudio } from '../lib/alarm';

function greeting(clockMin: number) {
  if (clockMin < 300) return 'Good night';
  if (clockMin < 720) return 'Good morning';
  if (clockMin < 1080) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const { nights, journal, settings, session, today, now, startSession, cancelSession } = useStore();
  const { openRecordForm, openScore, openNight, navigate, toast, confirm } = useUI();
  const { clock } = useClock();
  const tz = deviceTimeZone();
  const nowClock = clockMinutesInZone(now, tz);

  const prim = useMemo(() => primaryNights(nights), [nights]);
  const last = prim.at(-1) ?? null;
  const prev = prim.at(-2) ?? null;
  const week = useMemo(() => rangeStats(nights, today, 7), [nights, today]);
  const schedule = useMemo(() => scheduleInfo(nights, settings, today), [nights, settings, today]);
  const debt = useMemo(() => sleepDebt(nights, today, settings.goalMin), [nights, today, settings.goalMin]);
  const streak = useMemo(() => streaks(nights, today), [nights, today]);
  const weekly = useMemo(() => weeklyGoalProgress(nights, today), [nights, today]);
  const insights = useMemo(() => buildInsights(nights, journal, settings, today), [nights, journal, settings, today]);

  const sevenAvgExcl = useMemo(() => {
    if (!last) return null;
    const others = prim.filter((n) => n !== last).slice(-7);
    return others.length ? others.reduce((a, n) => a + n.asleep, 0) / others.length : null;
  }, [prim, last]);

  const start = async () => {
    unlockAudio();
    await startSession();
    toast(settings.smartAlarm.enabled ? 'Sleep well. Gentle wake alarm is armed.' : 'Sleep well. Tap “I’m awake” when you get up.');
  };
  const stop = () => {
    if (!session) return;
    openRecordForm({
      prefill: { bedtime: session.startedAt, wakeTime: new Date().toISOString(), timezone: session.timezone },
      fromSession: true,
    });
  };
  const cancel = async () => {
    if (await confirm({ title: 'Cancel this session?', body: 'Nothing will be saved.', confirmLabel: 'Cancel session', danger: true })) {
      await cancelSession();
    }
  };

  return (
    <div className="page page--home">
      <header className="hero-header">
        <StarField count={50} />
        <div className="hero-header__text">
          <p className="eyebrow">{formatDateKey(today, 'long')}</p>
          <h1 className="page-title">
            {greeting(nowClock)}
            {settings.name ? `, ${settings.name}` : ''}
          </h1>
        </div>
        <Moon size={84} />
      </header>

      {/* Session */}
      {session ? (
        <SessionCard startedAt={session.startedAt} tz={session.timezone} now={now} onStop={stop} onCancel={cancel} />
      ) : (
        <Card className="card--cta">
          <div className="cta">
            <div className="cta__text">
              <h2 className="card-title">
                <MoonIcon size={16} /> {nowClock >= 1080 || nowClock < 240 ? 'Ready for bed?' : 'Track tonight'}
              </h2>
              <p className="muted small">
                Suggested bedtime <strong className="text-strong">{clock(schedule.recommendedBed)}</strong> for a{' '}
                {clock(schedule.recommendedWake)} wake-up.
              </p>
            </div>
            <div className="cta__actions">
              <Button variant="primary" size="lg" icon={<BedDouble size={18} />} onClick={start}>
                Start sleep
              </Button>
              <Button variant="ghost" icon={<Plus size={16} />} onClick={() => openRecordForm()}>
                Log a night
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!last ? (
        <Card>
          <EmptyState
            icon={<Moon size={64} />}
            title="Your first night starts here"
            body="Start a sleep session when you go to bed, or log a past night with bedtime and wake-up time. Everything stays private on this device."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => openRecordForm()}>
                Log a night
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid-2">
          {/* Overview */}
          <Card glow className="overview">
            <CardHeader
              title={relativeDayLabel(last.dateKey, today) === 'Today' ? 'Last night' : relativeDayLabel(last.dateKey, today)}
              subtitle={formatDateKey(last.dateKey, 'long')}
              action={
                <IconButton label="Open night details" onClick={() => openNight(last.record.id)}>
                  <ChevronRight size={18} />
                </IconButton>
              }
            />
            <div className="overview__body">
              <Ring value={last.asleep / settings.goalMin} size={196} stroke={14} label={`${formatDuration(last.asleep)} of ${formatDuration(settings.goalMin)} goal`}>
                <div className="ring-value">{formatDuration(last.asleep, { short: true })}</div>
                <div className="ring-sub">of {formatDuration(settings.goalMin, { short: true })} goal</div>
                <div className={cx('ring-badge', last.metGoal ? 'tone-good' : 'tone-warn')}>
                  {last.metGoal ? 'Goal met' : `${formatDuration(-last.goalDiff, { short: true })} short`}
                </div>
              </Ring>
              <div className="overview__side">
                <button type="button" className="score-tile" onClick={() => openScore(last.record.id)}>
                  <span className="score-tile__label">
                    Sleep Score <Info size={12} />
                  </span>
                  <span className="score-tile__num">{last.score.total}</span>
                  <span className="score-tile__state">{last.score.label}</span>
                  <span className="score-tile__bar">
                    <span style={{ width: `${last.score.total}%` }} />
                  </span>
                </button>
                <div className="compare">
                  <div className="compare__row">
                    <span>vs previous night</span>
                    <Delta value={prev ? last.asleep - prev.asleep : null} format={(v) => signedMinutes(v)} />
                  </div>
                  <div className="compare__row">
                    <span>vs 7-night avg</span>
                    <Delta value={sevenAvgExcl != null ? last.asleep - sevenAvgExcl : null} format={(v) => signedMinutes(v)} />
                  </div>
                  <div className="compare__row">
                    <span>Efficiency</span>
                    <strong>{last.efficiency != null ? `${Math.round(last.efficiency)}%` : '—'}</strong>
                  </div>
                  <div className="compare__row">
                    <span>Score vs previous</span>
                    <Delta value={prev ? last.score.total - prev.score.total : null} unit="" format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`} />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader title="Sleep timeline" icon={<CalendarClock size={16} />} subtitle="From getting into bed to waking up" />
            <SleepTimeline night={last} />
          </Card>

          {/* Stages */}
          <Card>
            <CardHeader title="Sleep stages" icon={<Layers size={16} />} subtitle="From your wearable or manual entry" />
            <StagesView night={last} onAdd={() => openRecordForm({ record: last.record })} />
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader
              title="Sleep schedule"
              icon={<AlarmClock size={16} />}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('profile')}>
                  Adjust
                </Button>
              }
            />
            <div className="schedule">
              <div className="schedule__item">
                <MoonIcon size={18} />
                <span>Recommended bedtime</span>
                <strong>{clock(schedule.recommendedBed)}</strong>
                <small>
                  {formatDuration(settings.goalMin, { short: true })} goal + {schedule.latencyUsed} min to fall asleep
                  {schedule.latencyFromData ? ' (your average)' : ''}
                </small>
              </div>
              <div className="schedule__item">
                <Sunrise size={18} />
                <span>Wake-up time</span>
                <strong>{clock(schedule.recommendedWake)}</strong>
                <small>Your target</small>
              </div>
            </div>
            <div className="schedule-compare">
              <ScheduleRow
                label="Bedtime"
                actual={clock(last.bedClock)}
                target={clock(parseHHmm(settings.targetBedtime))}
                diff={schedule.lastBedDiff}
              />
              <ScheduleRow label="Wake-up" actual={clock(last.wakeClock)} target={clock(parseHHmm(settings.targetWake))} diff={schedule.lastWakeDiff} />
            </div>
            <div className="consistency">
              <div className="consistency__top">
                <span>7-day consistency</span>
                <strong>{schedule.consistency != null ? `${schedule.consistency}/100` : 'Needs 3+ nights'}</strong>
              </div>
              <ProgressBar value={schedule.consistency ?? 0} max={100} label="Schedule consistency" />
              {week.bedSd != null && week.logged >= 3 && (
                <small className="muted">
                  Bedtime varies ±{Math.round(week.bedSd)} min · wake-up ±{Math.round(week.wakeSd ?? 0)} min
                </small>
              )}
            </div>
          </Card>

          {/* Small tiles */}
          <div className="tiles">
            <Card className="tile">
              <div className="tile__icon">
                <TrendingDown size={18} />
              </div>
              <div className="tile__label">Sleep debt</div>
              <div className="tile__value">{debt.nights ? formatDuration(debt.minutes, { short: true }) : '—'}</div>
              <div className="tile__sub">{debt.nights ? `Last ${debt.windowDays} days · ${debt.nights} nights logged` : 'Log nights to estimate'}</div>
            </Card>
            <Card className="tile">
              <div className="tile__icon">
                <Flame size={18} />
              </div>
              <div className="tile__label">Goal streak</div>
              <div className="tile__value">
                {streak.goalCurrent} <small>{streak.goalCurrent === 1 ? 'night' : 'nights'}</small>
              </div>
              <div className="tile__sub">Best {streak.goalBest} · logging streak {streak.loggingCurrent}</div>
            </Card>
            <Card className="tile">
              <div className="tile__icon">
                <Target size={18} />
              </div>
              <div className="tile__label">This week</div>
              <div className="tile__value">
                {weekly.met}/{settings.weeklyGoalNights} <small>nights</small>
              </div>
              <ProgressBar value={weekly.met} max={settings.weeklyGoalNights} label="Weekly goal" />
            </Card>
          </div>

          {/* Insights */}
          <Card className="span-2">
            <CardHeader
              title="Insights"
              icon={<Lightbulb size={16} />}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('analytics')}>
                  Analytics
                </Button>
              }
            />
            <ul className="insights">
              {insights.slice(0, 3).map((i) => (
                <li key={i.id} className={`insight insight--${i.tone}`}>
                  <Sparkles size={15} />
                  <div>
                    <strong>{i.title}</strong>
                    <p>{i.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );

  function ScheduleRow({ label, actual, target, diff }: { label: string; actual: string; target: string; diff: number | null }) {
    const late = diff != null && Math.abs(diff) > 15;
    return (
      <div className="schedule-row">
        <span className="schedule-row__label">{label}</span>
        <span className="schedule-row__vals">
          <strong>{actual}</strong>
          <span className="muted"> / target {target}</span>
        </span>
        <span className={cx('schedule-row__diff', late ? 'tone-warn' : 'tone-good')}>
          {diff == null ? '—' : Math.abs(diff) <= 15 ? 'On time' : `${formatDuration(Math.abs(diff), { short: true })} ${diff > 0 ? 'late' : 'early'}`}
        </span>
      </div>
    );
  }
}

function SessionCard({
  startedAt,
  tz,
  now,
  onStop,
  onCancel,
}: {
  startedAt: string;
  tz: string;
  now: number;
  onStop: () => void;
  onCancel: () => void;
}) {
  const { settings } = useStore();
  const { clock, instant } = useClock();
  const elapsed = Math.max(0, (now - new Date(startedAt).getTime()) / 60_000);
  const a = settings.smartAlarm;
  const latest = parseHHmm(a.time);
  return (
    <Card glow className="session">
      <StarField count={30} />
      <div className="session__top">
        <span className="pulse" aria-hidden />
        <span className="eyebrow">Sleep session in progress</span>
        <IconButton label="Cancel session" onClick={onCancel} className="session__cancel">
          <X size={16} />
        </IconButton>
      </div>
      <div className="session__elapsed">{formatDuration(elapsed)}</div>
      <p className="muted">In bed since {instant(startedAt, tz)}</p>
      {a.enabled ? (
        <p className="session__alarm">
          <AlarmClock size={14} /> Gentle wake between {clock(normalizeClock(latest - a.windowMin))} and {clock(latest)} · keep this tab open
        </p>
      ) : (
        <p className="session__alarm muted">
          <AlarmClock size={14} /> No alarm set
        </p>
      )}
      <Button variant="primary" size="lg" block icon={<Sunrise size={18} />} onClick={onStop}>
        I’m awake
      </Button>
    </Card>
  );
}
