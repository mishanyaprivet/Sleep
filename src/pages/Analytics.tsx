import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  LineChart as LineIcon,
  Medal,
  MoveHorizontal,
  Repeat,
  Trophy,
} from 'lucide-react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useClock } from '../state/format';
import { BarChart, LineChart, SleepWindowChart } from '../components/charts';
import { Button, Card, CardHeader, Delta, EmptyState, IconButton, Segmented, Stat } from '../components/ui';
import type { Night } from '../lib/sleep';
import { primaryNights, rangeStats, weekdayAverages } from '../lib/sleep';
import {
  addDays,
  clockDiff,
  formatDateKey,
  formatDuration,
  parseHHmm,
  toNightAxis,
  WEEKDAYS,
  signedMinutes,
} from '../lib/time';

type Range = 7 | 30 | 90;

export function AnalyticsPage() {
  const { nights, today, settings } = useStore();
  const { openNight } = useUI();
  const { clock } = useClock();
  const [range, setRange] = useState<Range>(() => {
    try {
      return (Number(localStorage.getItem('lumen.ui.range')) as Range) || 7;
    } catch {
      return 7;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('lumen.ui.range', String(range));
    } catch {
      /* ignore */
    }
  }, [range]);

  const prim = useMemo(() => primaryNights(nights), [nights]);
  const byDate = useMemo(() => new Map(prim.map((n) => [n.dateKey, n])), [prim]);
  const days = useMemo(() => Array.from({ length: range }, (_, i) => addDays(today, i - range + 1)), [range, today]);
  const stats = useMemo(() => rangeStats(nights, today, range), [nights, today, range]);
  const prev = useMemo(() => rangeStats(nights, addDays(today, -range), range), [nights, today, range]);
  const wd = useMemo(() => weekdayAverages(nights, today, Math.max(range, 28)), [nights, today, range]);

  const [selected, setSelected] = useState<string | null>(null);
  const loggedInRange = days.filter((d) => byDate.has(d));
  const selKey = selected && byDate.has(selected) ? selected : (loggedInRange.at(-1) ?? null);
  const selNight = selKey ? byDate.get(selKey)! : null;

  const label = (k: string) => (range === 7 ? WEEKDAYS[new Date(k + 'T12:00:00Z').getUTCDay()] : formatDateKey(k).replace(/, \d{4}$/, ''));
  const tipFor = (n: Night) => (
    <>
      <strong>{formatDuration(n.asleep)}</strong>
      <span>
        {formatDateKey(n.dateKey, 'weekday')} {formatDateKey(n.dateKey)} · score {n.score.total}
      </span>
      <span>
        {clock(n.bedClock)} → {clock(n.wakeClock)}
      </span>
    </>
  );

  if (!prim.length) {
    return (
      <div className="page">
        <PageHeader range={range} setRange={setRange} />
        <Card>
          <EmptyState
            icon={<BarChart3 size={22} />}
            title="Analytics need a few nights"
            body="Once you’ve logged some sleep, trends, averages and consistency will appear here."
          />
        </Card>
      </div>
    );
  }

  const prevNightIdx = selKey ? loggedInRange.indexOf(selKey) : -1;

  return (
    <div className="page">
      <PageHeader range={range} setRange={setRange} />

      <Card>
        <CardHeader
          title={`Last ${range} days`}
          subtitle={`${stats.logged} of ${range} nights logged · compared with the ${range} days before`}
        />
        <div className="kpis">
          <Stat
            label="Avg. asleep"
            value={formatDuration(stats.avgAsleep, { short: true })}
            sub={<Delta value={stats.avgAsleep != null && prev.avgAsleep != null ? stats.avgAsleep - prev.avgAsleep : null} format={signedMinutes} />}
          />
          <Stat
            label="Sleep score"
            value={stats.avgScore != null ? Math.round(stats.avgScore) : '—'}
            sub={
              stats.avgQuality != null ? `felt ${stats.avgQuality.toFixed(1)}/5` : (
                <Delta value={stats.avgScore != null && prev.avgScore != null ? stats.avgScore - prev.avgScore : null} unit="" format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)} pts`} />
              )
            }
          />
          <Stat
            label="Efficiency"
            value={stats.avgEfficiency != null ? `${Math.round(stats.avgEfficiency)}%` : '—'}
            sub={stats.avgEfficiency == null ? 'add latency/awake' : undefined}
            tone="muted"
          />
          <Stat
            label="Consistency"
            value={stats.consistency != null ? stats.consistency : '—'}
            sub={stats.bedSd != null && stats.logged >= 3 ? `bed ±${Math.round(stats.bedSd)}m · wake ±${Math.round(stats.wakeSd ?? 0)}m` : 'needs 3+ nights'}
            tone="muted"
          />
          <Stat label="Avg. bedtime" value={stats.avgBed != null ? clock(stats.avgBed) : '—'} sub={`target ${clock(parseHHmm(settings.targetBedtime))}`} tone="muted" />
          <Stat label="Avg. wake-up" value={stats.avgWake != null ? clock(stats.avgWake) : '—'} sub={`target ${clock(parseHHmm(settings.targetWake))}`} tone="muted" />
          <Stat label="Total sleep" value={formatDuration(stats.totalAsleep, { short: true })} sub={`${stats.logged} nights`} tone="muted" />
          <Stat
            label="Goal completion"
            value={stats.goalCompletion != null ? `${Math.round(stats.goalCompletion)}%` : '—'}
            sub={`${stats.goalNights} of ${stats.logged} nights`}
            tone="muted"
          />
        </div>
      </Card>

      <div className="grid-2">
        <Card className="span-2">
          <CardHeader title="Sleep duration" icon={<BarChart3 size={16} />} subtitle="Time asleep per night · tap a bar for details" />
          <BarChart
            ariaLabel="Sleep duration per night"
            data={days.map((k) => {
              const n = byDate.get(k);
              return { key: k, label: label(k), value: n ? n.asleep : null, tip: n ? tipFor(n) : undefined, emphasis: k === selKey };
            })}
            goal={settings.goalMin}
            goalLabel={`Goal ${formatDuration(settings.goalMin, { short: true })}`}
            yFormat={(v) => `${Math.round(v / 60)}h`}
            onSelect={setSelected}
            selectedKey={selKey}
            height={200}
          />
          <div className="legend legend--inline">
            <span><i className="legend-bar legend-bar--met" />Goal met</span>
            <span><i className="legend-bar" />Below goal</span>
            <span><i className="legend-line" />Goal</span>
          </div>
        </Card>

        {/* Daily statistics */}
        <Card>
          <CardHeader
            title="Daily statistics"
            icon={<CalendarDays size={16} />}
            subtitle={selNight ? formatDateKey(selNight.dateKey, 'long') : 'No night selected'}
            action={
              <div className="row-tight">
                <IconButton label="Previous night" disabled={prevNightIdx <= 0} onClick={() => setSelected(loggedInRange[prevNightIdx - 1])}>
                  <ChevronLeft size={16} />
                </IconButton>
                <IconButton
                  label="Next night"
                  disabled={prevNightIdx < 0 || prevNightIdx >= loggedInRange.length - 1}
                  onClick={() => setSelected(loggedInRange[prevNightIdx + 1])}
                >
                  <ChevronRight size={16} />
                </IconButton>
              </div>
            }
          />
          {selNight ? (
            <>
              <div className="kpis kpis--3">
                <Stat label="Asleep" value={formatDuration(selNight.asleep, { short: true })} sub={signedMinutes(selNight.goalDiff) + ' vs goal'} tone={selNight.metGoal ? 'good' : 'warn'} />
                <Stat label="Score" value={selNight.score.total} sub={selNight.score.label} tone="muted" />
                <Stat label="Efficiency" value={selNight.efficiency != null ? `${Math.round(selNight.efficiency)}%` : '—'} tone="muted" />
                <Stat
                  label="Bedtime"
                  value={clock(selNight.bedClock)}
                  sub={stats.avgBed != null ? `${signedMinutes(clockDiff(selNight.bedClock, stats.avgBed))} vs avg` : undefined}
                  tone="muted"
                />
                <Stat
                  label="Wake-up"
                  value={clock(selNight.wakeClock)}
                  sub={stats.avgWake != null ? `${signedMinutes(clockDiff(selNight.wakeClock, stats.avgWake))} vs avg` : undefined}
                  tone="muted"
                />
                <Stat label="In bed" value={formatDuration(selNight.timeInBed, { short: true })} tone="muted" />
              </div>
              <Button size="sm" variant="ghost" block onClick={() => openNight(selNight.record.id)}>
                View full night
              </Button>
            </>
          ) : (
            <EmptyState title="No nights in this range" />
          )}
        </Card>

        <Card>
          <CardHeader title="Highlights" icon={<Trophy size={16} />} subtitle={`Within the last ${range} days`} />
          <div className="highlights">
            <Highlight icon={<Trophy size={15} />} label="Best night" night={stats.best} value={(n) => `Score ${n.score.total}`} />
            <Highlight icon={<Medal size={15} />} label="Toughest night" night={stats.worst} value={(n) => `Score ${n.score.total}`} />
            <Highlight icon={<MoveHorizontal size={15} />} label="Longest sleep" night={stats.longest} value={(n) => formatDuration(n.asleep)} />
            <Highlight icon={<Clock size={15} />} label="Shortest sleep" night={stats.shortest} value={(n) => formatDuration(n.asleep)} />
          </div>
        </Card>

        <Card className="span-2">
          <CardHeader title="Sleep window" icon={<Clock size={16} />} subtitle="Bedtime to wake-up each night · shaded band is your target schedule" />
          <SleepWindowChart
            ariaLabel="Bedtime and wake time per night"
            clockFormat={clock}
            targetBed={toNightAxis(parseHHmm(settings.targetBedtime))}
            targetWake={toNightAxis(parseHHmm(settings.targetWake))}
            data={days.map((k) => {
              const n = byDate.get(k);
              const bed = n ? toNightAxis(n.bedClock) : null;
              let wake = n ? toNightAxis(n.wakeClock) : null;
              if (bed != null && wake != null && wake <= bed) wake += 1440;
              return {
                key: k,
                label: label(k),
                bed,
                wake,
                tip: n ? tipFor(n) : undefined,
              };
            })}
          />
        </Card>

        <Card>
          <CardHeader title="Sleep score trend" icon={<LineIcon size={16} />} subtitle="0–100, from what you logged" />
          <LineChart
            ariaLabel="Sleep score trend"
            data={days.map((k) => {
              const n = byDate.get(k);
              return { key: k, label: label(k), value: n ? n.score.total : null, tip: n ? <><strong>Score {n.score.total}</strong><span>{formatDateKey(k)}</span></> : undefined };
            })}
            domain={[0, 100]}
            yTicks={[0, 25, 50, 75, 100]}
            yFormat={(v) => String(Math.round(v))}
            reference={stats.avgScore ?? undefined}
            referenceLabel={stats.avgScore != null ? `avg ${Math.round(stats.avgScore)}` : undefined}
          />
        </Card>

        <Card>
          <CardHeader title="Sleep efficiency" icon={<LineIcon size={16} />} subtitle="Share of time in bed spent asleep" />
          {days.some((k) => byDate.get(k)?.efficiency != null) ? (
            <LineChart
              ariaLabel="Sleep efficiency trend"
              data={days.map((k) => {
                const n = byDate.get(k);
                return {
                  key: k,
                  label: label(k),
                  value: n?.efficiency ?? null,
                  tip: n?.efficiency != null ? <><strong>{Math.round(n.efficiency)}%</strong><span>{formatDateKey(k)}</span></> : undefined,
                };
              })}
              domain={[50, 100]}
              yTicks={[50, 75, 100]}
              yFormat={(v) => `${Math.round(v)}%`}
              reference={85}
              referenceLabel="85%"
            />
          ) : (
            <EmptyState title="No efficiency data" body="Log time to fall asleep and time awake to see efficiency." />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Schedule changes"
            icon={<Repeat size={16} />}
            subtitle={`Last ${range} days vs the ${range} days before`}
          />
          {prev.logged >= 2 && stats.logged >= 2 ? (
            <div className="changes">
              <ChangeRow label="Avg. bedtime" from={prev.avgBed != null ? clock(prev.avgBed) : '—'} to={stats.avgBed != null ? clock(stats.avgBed) : '—'} delta={stats.avgBed != null && prev.avgBed != null ? clockDiff(stats.avgBed, prev.avgBed) : null} lateWord />
              <ChangeRow label="Avg. wake-up" from={prev.avgWake != null ? clock(prev.avgWake) : '—'} to={stats.avgWake != null ? clock(stats.avgWake) : '—'} delta={stats.avgWake != null && prev.avgWake != null ? clockDiff(stats.avgWake, prev.avgWake) : null} lateWord />
              <ChangeRow label="Avg. asleep" from={formatDuration(prev.avgAsleep, { short: true })} to={formatDuration(stats.avgAsleep, { short: true })} delta={stats.avgAsleep != null && prev.avgAsleep != null ? stats.avgAsleep - prev.avgAsleep : null} />
              <ChangeRow label="Consistency" from={prev.consistency != null ? String(prev.consistency) : '—'} to={stats.consistency != null ? String(stats.consistency) : '—'} delta={null} />
            </div>
          ) : (
            <EmptyState title="Not enough history yet" body={`Needs at least 2 logged nights in both this and the previous ${range}-day period.`} />
          )}
        </Card>

        <Card>
          <CardHeader title="By weekday" icon={<CalendarDays size={16} />} subtitle={`Average time asleep · last ${Math.max(range, 28)} days`} />
          <BarChart
            ariaLabel="Average sleep by weekday"
            data={[1, 2, 3, 4, 5, 6, 0].map((w) => {
              const d = wd[w];
              return {
                key: String(w),
                label: WEEKDAYS[w],
                value: d.avgAsleep,
                tip: d.avgAsleep != null ? <><strong>{formatDuration(d.avgAsleep)}</strong><span>{WEEKDAYS[w]} · {d.n} nights</span></> : undefined,
              };
            })}
            goal={settings.goalMin}
            yFormat={(v) => `${Math.round(v / 60)}h`}
            height={170}
            labelEvery={1}
          />
        </Card>
      </div>
      <p className="disclaimer">Statistics are calculated from your own entries. Lumen is a wellness tool, not a medical device.</p>
    </div>
  );

  function Highlight({ icon, label, night, value }: { icon: React.ReactNode; label: string; night: Night | null; value: (n: Night) => string }) {
    return (
      <button type="button" className="highlight" disabled={!night} onClick={() => night && openNight(night.record.id)}>
        <span className="highlight__icon">{icon}</span>
        <span className="highlight__label">{label}</span>
        <strong>{night ? value(night) : '—'}</strong>
        <small>{night ? `${formatDateKey(night.dateKey, 'weekday')}, ${formatDateKey(night.dateKey)}` : ''}</small>
      </button>
    );
  }
}

function ChangeRow({ label, from, to, delta, lateWord }: { label: string; from: string; to: string; delta: number | null; lateWord?: boolean }) {
  return (
    <div className="change-row">
      <span className="change-row__label">{label}</span>
      <span className="change-row__vals">
        <span className="muted">{from}</span> → <strong>{to}</strong>
      </span>
      <span className="change-row__delta">
        {delta == null
          ? ''
          : Math.abs(delta) < 5
            ? 'steady'
            : lateWord
              ? `${formatDuration(Math.abs(delta), { short: true })} ${delta > 0 ? 'later' : 'earlier'}`
              : signedMinutes(delta)}
      </span>
    </div>
  );
}

function PageHeader({ range, setRange }: { range: Range; setRange: (r: Range) => void }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">Trends & statistics</p>
        <h1 className="page-title">Analytics</h1>
      </div>
      <Segmented
        label="Date range"
        value={range}
        onChange={setRange}
        options={[
          { value: 7, label: '7D' },
          { value: 30, label: '30D' },
          { value: 90, label: '90D' },
        ]}
      />
    </header>
  );
}
