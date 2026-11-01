import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AudioLines, Info, Pause, Play } from 'lucide-react';
import type { NightRecording, SoundClip } from '../data/types';
import { estimateRestlessness, REST_LABEL, type RestState } from '../lib/soundAnalysis';
import { clockMinutesInZone, formatDuration, normalizeClock } from '../lib/time';
import { useClock } from '../state/format';
import { useRecording } from '../state/recording';
import { useWidth } from './charts';
import { cx, Pill } from './ui';

const REST_ORDER: RestState[] = ['awake', 'restless', 'calm'];

export function SoundSummary({ rec }: { rec: NightRecording }) {
  const recorded = rec.epochs.filter((e) => e.db != null).length;
  const pct = recorded ? Math.round((rec.snoreMin / recorded) * 100) : 0;
  return (
    <div className="sound-stats">
      <div>
        <span>Snoring</span>
        <strong>{formatDuration(rec.snoreMin, { short: true })}</strong>
        <small>{pct}% of recorded time</small>
      </div>
      <div>
        <span>Episodes</span>
        <strong>{rec.snoreEpisodes}</strong>
        <small>snoring bouts</small>
      </div>
      <div>
        <span>Noises</span>
        <strong>{rec.noiseEvents}</strong>
        <small>loud sounds</small>
      </div>
      <div>
        <span>Loudest</span>
        <strong>{rec.peakAboveFloor != null ? `+${rec.peakAboveFloor} dB` : '—'}</strong>
        <small>above room noise</small>
      </div>
    </div>
  );
}

/** Per-minute sound level, snoring and estimated restlessness across the night. */
export function NightSoundChart({ rec, tz }: { rec: NightRecording; tz: string }) {
  const { clock } = useClock();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const rest = useMemo(() => estimateRestlessness(rec.epochs), [rec.epochs]);
  const n = rec.epochs.length;
  const floor = rec.floorDb ?? -60;
  const levels = rec.epochs.map((e) => (e.db != null ? Math.max(0, e.db - floor) : null));
  const yMax = Math.max(20, Math.ceil(Math.max(0, ...levels.map((v) => v ?? 0)) / 10) * 10);

  const padL = 8;
  const padR = 8;
  const H_LEVEL = 92;
  const H_SNORE = 18;
  const H_REST = 22;
  const gap = 18;
  const top = 6;
  const ySnore = top + H_LEVEL + gap;
  const yRest = ySnore + H_SNORE + gap;
  const height = yRest + H_REST + 22;
  const iw = width - padL - padR;
  const x = (m: number) => padL + (n ? (m / n) * iw : 0);
  const bw = Math.max(0.5, iw / Math.max(1, n));
  const y = (v: number) => top + H_LEVEL - (v / yMax) * H_LEVEL;
  const startClock = clockMinutesInZone(rec.startedAt, tz);

  // Level area path, broken at gaps.
  const paths: string[] = [];
  let cur = '';
  levels.forEach((v, i) => {
    if (v == null) {
      if (cur) paths.push(cur);
      cur = '';
      return;
    }
    const px = x(i) + bw / 2;
    cur += `${cur ? 'L' : 'M'}${px},${y(v)} `;
  });
  if (cur) paths.push(cur);

  const ticks: number[] = [];
  const firstHour = Math.ceil(startClock / 60) * 60 - startClock;
  for (let m = firstHour; m < n; m += 60) ticks.push(m);
  const every = Math.max(1, Math.ceil(ticks.length / Math.max(3, Math.floor(iw / 56))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))));
  };

  const h = hover != null ? rec.epochs[hover] : null;
  return (
    <div className="chart sound-chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="Sound level, snoring and estimated restlessness through the night">
        <line x1={padL} x2={width - padR} y1={top + H_LEVEL} y2={top + H_LEVEL} className="chart-grid" />
        {paths.map((d, i) => (
          <path key={i} d={d} className="sound-level" />
        ))}
        <text x={padL} y={top + 10} className="chart-axis">
          Sound level
        </text>
        <text x={padL} y={ySnore - 2} className="chart-axis">
          Snoring
        </text>
        {rec.epochs.map((e, i) =>
          e.snore > 0 ? (
            <rect key={i} x={x(i)} width={Math.max(1, bw)} y={ySnore + 4 + (H_SNORE - 4) * (1 - e.snore / 60)} height={(H_SNORE - 4) * (e.snore / 60)} className="sound-snore" />
          ) : null,
        )}
        <line x1={padL} x2={width - padR} y1={ySnore + H_SNORE} y2={ySnore + H_SNORE} className="chart-grid" />
        {rest.states.map((s, i) => (
          <rect key={i} x={x(i)} width={bw + 0.5} y={yRest} height={H_REST} className={`rest rest--${s}`} />
        ))}
        {ticks.map((m, i) =>
          i % every === 0 ? (
            <text key={m} x={x(m)} y={height - 6} textAnchor="middle" className="chart-axis">
              {clock(normalizeClock(startClock + m))}
            </text>
          ) : null,
        )}
        {hover != null && <line x1={x(hover) + bw / 2} x2={x(hover) + bw / 2} y1={top} y2={yRest + H_REST} className="chart-crosshair" />}
        <rect x={padL} y={top} width={Math.max(1, iw)} height={yRest + H_REST - top} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
      </svg>
      {h && hover != null && (
        <div className="chart-tip" style={{ left: Math.max(70, Math.min(width - 70, x(hover))), top: 0 }}>
          <strong>{clock(normalizeClock(startClock + h.m))}</strong>
          {h.db == null ? (
            <span>No data (screen off / app closed)</span>
          ) : (
            <>
              <span>Level +{Math.round(Math.max(0, h.db - floor))} dB</span>
              {h.snore > 0 && <span>Snoring {Math.round(h.snore)} s</span>}
              <span>{REST_LABEL[rest.states[hover]]}</span>
            </>
          )}
        </div>
      )}
      <div className="legend">
        <span><i className="legend-snore" />Probable snoring</span>
        {REST_ORDER.map((s) => (
          <span key={s}><i className={`rest--${s}`} />{REST_LABEL[s]}</span>
        ))}
        {rec.gapsMin > 0 && <span><i className="rest--gap" />No data</span>}
      </div>
    </div>
  );
}

export function RestBreakdown({ rec }: { rec: NightRecording }) {
  const rest = useMemo(() => estimateRestlessness(rec.epochs), [rec.epochs]);
  const total = rest.calmMin + rest.restlessMin + rest.awakeMin || 1;
  const rows: { k: RestState; v: number }[] = [
    { k: 'calm', v: rest.calmMin },
    { k: 'restless', v: rest.restlessMin },
    { k: 'awake', v: rest.awakeMin },
  ];
  return (
    <div className="rest-breakdown">
      <div className="stacked" style={{ height: 14 }} role="img" aria-label="Estimated restlessness">
        {rows.filter((r) => r.v > 0).map((r) => (
          <div key={r.k} className={`stacked__seg rest--${r.k}`} style={{ flexGrow: r.v / total }} />
        ))}
      </div>
      <ul className="stage-list">
        {rows.map((r) => (
          <li key={r.k}>
            <i className={`dot rest--${r.k}`} />
            <span className="stage-list__name">{REST_LABEL[r.k]}</span>
            <span className="stage-list__bar">
              <span className={`rest--${r.k}`} style={{ width: `${Math.max(2, (r.v / total) * 100)}%` }} />
            </span>
            <span className="stage-list__min">{formatDuration(r.v, { short: true })}</span>
            <span className="stage-list__pct">{Math.round((r.v / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <p className="hint-line">
        <Info size={13} />
        Estimated from {rest.basis === 'motion+sound' ? 'phone movement and sounds' : 'sounds only (no motion sensor)'}. This shows
        how restless the night was — it is not a measurement of REM, light or deep sleep.
      </p>
    </div>
  );
}

export function ClipList({ clips, tz, limit }: { clips: SoundClip[]; tz: string; limit?: number }) {
  const { clock } = useClock();
  const { getClipUrl } = useRecording();
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const audio = useRef<HTMLAudioElement | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = async (c: SoundClip) => {
    if (playing === c.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const url = await getClipUrl(c.id);
    if (!url) {
      setMissing((m) => new Set(m).add(c.id));
      return;
    }
    const a = new Audio(url);
    audio.current = a;
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    a.onended = () => setPlaying(null);
    setProgress(0);
    setPlaying(c.id);
    void a.play();
  };

  if (!clips.length) {
    return <p className="muted small">No clips saved for this night.</p>;
  }
  const sorted = [...clips].sort((a, b) => a.at.localeCompare(b.at));
  const shown = limit && !showAll ? sorted.slice(0, limit) : sorted;
  return (
    <div className="clips">
      {shown.map((c) => (
        <div key={c.id} className={cx('clip', playing === c.id && 'is-playing')}>
          <button type="button" className="clip__play" onClick={() => void toggle(c)} aria-label={playing === c.id ? 'Pause' : 'Play'} disabled={missing.has(c.id)}>
            {playing === c.id ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="clip__main">
            <div className="clip__top">
              <strong>{clock(clockMinutesInZone(c.at, tz))}</strong>
              <Pill tone={c.kind === 'snore' ? 'accent' : 'neutral'}>{c.kind === 'snore' ? 'Snoring' : 'Noise'}</Pill>
            </div>
            <div className="clip__bar">
              <span style={{ width: `${playing === c.id ? progress * 100 : 0}%` }} />
            </div>
          </div>
          <span className="clip__meta">
            {missing.has(c.id) ? 'deleted' : `${c.durationSec}s · +${c.peakAboveFloor} dB`}
          </span>
        </div>
      ))}
      {limit && sorted.length > limit && !showAll && (
        <button type="button" className="link-btn" onClick={() => setShowAll(true)}>
          Show all {sorted.length} clips
        </button>
      )}
    </div>
  );
}

export function SoundSection({ rec, tz, compact }: { rec: NightRecording; tz: string; compact?: boolean }) {
  return (
    <div className="stack">
      <SoundSummary rec={rec} />
      <NightSoundChart rec={rec} tz={tz} />
      {!compact && (
        <div>
          <h3 className="subhead">
            <Activity size={13} /> Restlessness (estimate)
          </h3>
          <RestBreakdown rec={rec} />
        </div>
      )}
      <div>
        <h3 className="subhead">
          <AudioLines size={13} /> Recorded clips
        </h3>
        <ClipList clips={rec.clips} tz={tz} limit={compact ? 3 : undefined} />
      </div>
      {rec.gapsMin > 0 && (
        <p className="hint-line">
          <Info size={13} /> {formatDuration(rec.gapsMin, { short: true })} without data — the screen was locked or the app was in
          the background.
        </p>
      )}
    </div>
  );
}

export function LiveMeter({ level, snoring }: { level: number; snoring: boolean }) {
  const bars = 18;
  const on = Math.round(Math.min(1, level / 30) * bars);
  return (
    <div className={cx('meter', snoring && 'is-snoring')} aria-label={`Current level ${Math.round(level)} dB above room noise`}>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} className={i < on ? 'on' : ''} style={{ height: `${30 + (i / bars) * 70}%` }} />
      ))}
    </div>
  );
}

