import { BedDouble, Info, Moon as MoonIcon, Pencil, Sunrise, Timer, Watch } from 'lucide-react';
import type { Night } from '../lib/sleep';
import { STAGE_LABEL, stagePercentages } from '../lib/sleep';
import { formatDateKey, formatDuration, MIN_PER_DAY, signedMinutes } from '../lib/time';
import { useClock } from '../state/format';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { StackedBar } from './charts';
import { Sheet } from './Sheet';
import { Button, EmptyState, Pill, cx } from './ui';
import { QUALITY_LABELS } from './icons';

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function SleepTimeline({ night }: { night: Night }) {
  const { clock } = useClock();
  const tib = night.timeInBed || 1;
  const lat = night.latency ?? 0;
  const latPct = (lat / tib) * 100;
  // Hour ticks along the track.
  const ticks: { pct: number; label: string }[] = [];
  const firstHour = Math.ceil(night.bedClock / 60) * 60;
  for (let t = firstHour; t - night.bedClock <= tib; t += 60) {
    const pct = ((t - night.bedClock) / tib) * 100;
    if (pct > 4 && pct < 96) ticks.push({ pct, label: clock(t % MIN_PER_DAY) });
  }
  const step = Math.max(1, Math.ceil(ticks.length / 4));
  return (
    <div className="timeline">
      <div className="timeline__track" role="img" aria-label={`In bed from ${clock(night.bedClock)} to ${clock(night.wakeClock)}`}>
        {lat > 0 && <div className="timeline__latency" style={{ width: `${latPct}%` }} />}
        <div className="timeline__asleep" style={{ left: `${latPct}%` }} />
        {ticks.map((t, i) => (
          <span key={t.pct} className="timeline__tick" style={{ left: `${t.pct}%` }}>
            {i % step === 0 && <em>{t.label}</em>}
          </span>
        ))}
      </div>
      <div className="timeline__markers">
        <div className="tl-marker">
          <BedDouble size={15} />
          <span>In bed</span>
          <strong>{clock(night.bedClock)}</strong>
        </div>
        <div className="tl-marker">
          <MoonIcon size={15} />
          <span>Fell asleep</span>
          <strong>{night.asleepClock != null ? clock(night.asleepClock) : '—'}</strong>
          {night.latency != null && <small>{night.latency} min to fall asleep</small>}
        </div>
        <div className="tl-marker tl-marker--end">
          <Sunrise size={15} />
          <span>Woke up</span>
          <strong>{clock(night.wakeClock)}</strong>
        </div>
      </div>
      <div className="timeline__facts">
        <div>
          <span>Time in bed</span>
          <strong>{formatDuration(night.timeInBed)}</strong>
        </div>
        <div>
          <span>Time asleep</span>
          <strong>{formatDuration(night.asleep)}</strong>
        </div>
        <div>
          <span>Awake in night</span>
          <strong>
            {night.awake != null ? formatDuration(night.awake) : '—'}
            {night.record.awakenings != null && <small> · {night.record.awakenings}×</small>}
          </strong>
        </div>
      </div>
      {!night.hasSleepDetail && (
        <p className="hint-line">
          <Info size={13} /> Add time to fall asleep and time awake to estimate actual sleep and efficiency.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export function StagesView({ night, onAdd }: { night: Night | null; onAdd?: () => void }) {
  const st = night?.record.stages;
  if (!night || !st) {
    return (
      <EmptyState
        icon={<Watch size={22} />}
        title="No stage data for this night"
        body="Lumen doesn’t guess sleep stages. Enter the minutes from your wearable or sleep app to see your REM, light and deep sleep here."
        action={
          night && onAdd ? (
            <Button size="sm" onClick={onAdd} icon={<Pencil size={14} />}>
              Add stage data
            </Button>
          ) : undefined
        }
      />
    );
  }
  const parts = stagePercentages(st);
  return (
    <div className="stages">
      <StackedBar
        height={18}
        ariaLabel="Sleep stage distribution"
        segments={parts.map((p) => ({ key: p.key, value: p.minutes, className: `stage-${p.key}`, label: STAGE_LABEL[p.key] }))}
      />
      <ul className="stage-list">
        {parts.map((p) => (
          <li key={p.key}>
            <i className={`dot stage-${p.key}`} />
            <span className="stage-list__name">{STAGE_LABEL[p.key]}</span>
            <span className="stage-list__bar">
              <span className={`stage-${p.key}`} style={{ width: `${Math.max(2, p.pct)}%` }} />
            </span>
            <span className="stage-list__min">{formatDuration(p.minutes, { short: true })}</span>
            <span className="stage-list__pct">{Math.round(p.pct)}%</span>
          </li>
        ))}
      </ul>
      <p className="hint-line">
        <Watch size={13} /> {st.source === 'import' ? 'Imported' : 'Entered manually'}
        {st.device ? ` from ${st.device}` : ''}. Stage totals as reported by your device.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score breakdown
// ---------------------------------------------------------------------------

export function ScoreBreakdown({ night }: { night: Night }) {
  return (
    <div className="breakdown">
      {night.score.factors.map((f) => (
        <div key={f.key} className={cx('breakdown__row', f.value == null && 'is-off')}>
          <div className="breakdown__top">
            <span className="breakdown__label">{f.label}</span>
            <span className="breakdown__pts">
              {f.value == null ? 'not included' : `${Math.round(f.points)} / ${Math.round(f.maxPoints)}`}
            </span>
          </div>
          <div className="breakdown__bar">
            <span style={{ width: f.value == null ? 0 : `${f.value * 100}%` }} />
          </div>
          <div className="breakdown__detail">{f.detail}</div>
        </div>
      ))}
    </div>
  );
}

export function ScoreSheet() {
  const { scoreNightId, openScore } = useUI();
  const { nights } = useStore();
  const night = nights.find((n) => n.record.id === scoreNightId) ?? null;
  return (
    <Sheet open={!!night} onClose={() => openScore(null)} title="How your score works" subtitle={night ? formatDateKey(night.dateKey, 'long') : undefined}>
      {night && (
        <>
          <div className="score-hero">
            <div className="score-hero__num">{night.score.total}</div>
            <div>
              <div className="score-hero__label">{night.score.label}</div>
              <div className="muted small">Sleep Score · 0–100</div>
            </div>
          </div>
          <ScoreBreakdown night={night} />
          <div className="explainer">
            <p>
              <strong>Weights:</strong> duration 40, efficiency 20, consistency 20, how it felt 20. If a factor wasn’t
              recorded, its weight is shared among the others so the score still spans 0–100.
            </p>
            <p>
              <strong>Duration</strong> is full marks at your goal (and up to 2 h over). <strong>Efficiency</strong> is full at
              90%+ of time in bed asleep. <strong>Consistency</strong> compares bed and wake times with your average of
              recent nights (or your targets until you have three nights).
            </p>
            <p className="muted">
              The Sleep Score is a personal wellness indicator based only on what you logged. It is not a medical
              measurement or diagnosis.
            </p>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Night detail sheet
// ---------------------------------------------------------------------------

export function NightDetailSheet() {
  const { nightId, openNight, openRecordForm, openScore } = useUI();
  const { nights, settings } = useStore();
  const night = nights.find((n) => n.record.id === nightId) ?? null;
  const edit = () => {
    if (!night) return;
    openNight(null);
    openRecordForm({ record: night.record });
  };
  return (
    <Sheet
      open={!!night}
      onClose={() => openNight(null)}
      title={night ? formatDateKey(night.dateKey, 'long') : ''}
      subtitle={night && !night.primary ? 'Secondary sleep (nap)' : undefined}
      size="lg"
      footer={
        <>
          <div className="spacer" />
          <Button variant="primary" icon={<Pencil size={15} />} onClick={edit}>
            Edit night
          </Button>
        </>
      }
    >
      {night && (
        <div className="stack">
          <div className="detail-hero">
            <button type="button" className="score-chip" onClick={() => openScore(night.record.id)} aria-label="Score breakdown">
              <span className="score-chip__num">{night.score.total}</span>
              <span className="score-chip__label">{night.score.label}</span>
            </button>
            <div className="detail-hero__dur">
              <div className="big-number">{formatDuration(night.asleep)}</div>
              <div className="muted small">
                {signedMinutes(night.goalDiff)} vs {formatDuration(settings.goalMin, { short: true })} goal
                {night.efficiency != null && ` · ${Math.round(night.efficiency)}% efficiency`}
              </div>
            </div>
          </div>
          <SleepTimeline night={night} />
          <div>
            <h3 className="subhead">Sleep stages</h3>
            <StagesView night={night} onAdd={edit} />
          </div>
          <div>
            <h3 className="subhead">Score breakdown</h3>
            <ScoreBreakdown night={night} />
          </div>
          {(night.record.quality != null || night.record.notes) && (
            <div className="note-card">
              {night.record.quality != null && <Pill tone="accent">Felt: {QUALITY_LABELS[night.record.quality - 1]}</Pill>}
              {night.record.notes && <p>{night.record.notes}</p>}
            </div>
          )}
          <p className="hint-line">
            <Timer size={13} /> Logged {night.record.source === 'session' ? 'with sleep session' : night.record.source === 'import' ? 'via import' : 'manually'}
            {night.record.timezone ? ` · ${night.record.timezone}` : ''}
          </p>
        </div>
      )}
    </Sheet>
  );
}
