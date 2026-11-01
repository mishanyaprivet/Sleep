import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MIN_PER_DAY } from '../lib/time';

/** Measure an element's width for crisp, responsive SVG. */
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

// ---------------------------------------------------------------------------
// Ring
// ---------------------------------------------------------------------------

export function Ring({
  value,
  size = 200,
  stroke = 14,
  children,
  label,
  gradient = ['var(--ring-a)', 'var(--ring-b)'],
}: {
  value: number; // 0..1+ (clamped visually)
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label: string;
  gradient?: [string, string];
}) {
  const id = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(t);
  }, [value]);
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`rg-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gradient[0]} />
            <stop offset="100%" stopColor={gradient[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#rg-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring__arc"
        />
      </svg>
      <div className="ring__center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = Math.max(8, Math.min(width - 8, x));
  const align = left < 70 ? 'start' : left > width - 70 ? 'end' : 'center';
  return (
    <div className={`chart-tip chart-tip--${align}`} style={{ left }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart (durations etc.) with an optional goal line
// ---------------------------------------------------------------------------

export interface BarDatum {
  key: string;
  label: string;
  value: number | null;
  tip?: ReactNode;
  emphasis?: boolean;
}

export function BarChart({
  data,
  height = 180,
  goal,
  goalLabel,
  yFormat,
  maxValue,
  onSelect,
  selectedKey,
  ariaLabel,
  labelEvery,
}: {
  data: BarDatum[];
  height?: number;
  goal?: number;
  goalLabel?: string;
  yFormat: (v: number) => string;
  maxValue?: number;
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
  ariaLabel: string;
  labelEvery?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 34;
  const padR = 6;
  const padT = 12;
  const padB = 22;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const vals = data.map((d) => d.value ?? 0);
  const rawMax = Math.max(maxValue ?? 0, goal ?? 0, ...vals, 1);
  const step = rawMax > 600 ? 180 : rawMax > 240 ? 120 : rawMax > 100 ? 60 : rawMax > 20 ? 10 : 1;
  const yMax = Math.ceil((rawMax * 1.08) / step) * step;
  const y = (v: number) => padT + ih - (v / yMax) * ih;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(28, slot - 2));
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += step) ticks.push(t);
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(4, Math.floor(iw / 44))));
  const active = hover ?? (selectedKey ? data.findIndex((d) => d.key === selectedKey) : -1);

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart-axis">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const v = d.value;
          const top = v != null ? y(v) : y(0);
          const h = v != null ? Math.max(2, y(0) - top) : 0;
          const r = Math.min(4, bw / 2);
          const isActive = i === active;
          const met = goal != null && v != null && v >= goal - 5;
          return (
            <g key={d.key}>
              {v != null && (
                <path
                  d={roundedTopBar(cx - bw / 2, top, bw, h, r)}
                  className={`chart-bar ${met ? 'chart-bar--met' : ''} ${isActive ? 'is-active' : ''} ${d.emphasis ? 'is-emph' : ''}`}
                />
              )}
              {v == null && <circle cx={cx} cy={y(0) - 3} r={1.5} className="chart-missing" />}
              {i % every === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle" className="chart-axis">
                  {d.label}
                </text>
              )}
              <rect
                x={padL + slot * i}
                y={padT}
                width={slot}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => {
                  setHover(i);
                  if (onSelect && d.value != null) onSelect(d.key);
                }}
                style={{ cursor: onSelect && d.value != null ? 'pointer' : 'default' }}
              />
            </g>
          );
        })}
        {goal != null && (
          <g>
            <line x1={padL} x2={width - padR} y1={y(goal)} y2={y(goal)} className="chart-goal" />
            {goalLabel && (
              <text x={width - padR} y={y(goal) - 5} textAnchor="end" className="chart-goal-label">
                {goalLabel}
              </text>
            )}
          </g>
        )}
      </svg>
      {hover != null && data[hover] && (
        <Tooltip x={padL + slot * hover + slot / 2} width={width}>
          {data[hover].tip ?? (
            <>
              <strong>{data[hover].value != null ? yFormat(data[hover].value!) : 'No data'}</strong>
              <span>{data[hover].label}</span>
            </>
          )}
        </Tooltip>
      )}
    </div>
  );
}

function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

// ---------------------------------------------------------------------------
// Line chart with crosshair
// ---------------------------------------------------------------------------

export interface LinePoint {
  key: string;
  label: string;
  value: number | null;
  tip?: ReactNode;
}

export function LineChart({
  data,
  height = 160,
  domain,
  yTicks,
  yFormat,
  reference,
  referenceLabel,
  ariaLabel,
  area = true,
}: {
  data: LinePoint[];
  height?: number;
  domain: [number, number];
  yTicks: number[];
  yFormat: (v: number) => string;
  reference?: number;
  referenceLabel?: string;
  ariaLabel: string;
  area?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const n = data.length;
  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - ((v - domain[0]) / (domain[1] - domain[0])) * ih;

  // Split into continuous segments around gaps.
  const segs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  data.forEach((d, i) => {
    if (d.value == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push({ i, v: d.value });
  });
  if (cur.length) segs.push(cur);
  const path = (s: { i: number; v: number }[]) => s.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ');
  const every = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(iw / 48))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={`la-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart-axis">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {reference != null && (
          <g>
            <line x1={padL} x2={width - padR} y1={y(reference)} y2={y(reference)} className="chart-goal" />
            {referenceLabel && (
              <text x={width - padR} y={y(reference) - 5} textAnchor="end" className="chart-goal-label">
                {referenceLabel}
              </text>
            )}
          </g>
        )}
        {area &&
          segs.filter((s) => s.length > 1).map((s, k) => (
            <path
              key={`a${k}`}
              d={`${path(s)} L${x(s[s.length - 1].i)},${y(domain[0])} L${x(s[0].i)},${y(domain[0])} Z`}
              fill={`url(#la-${gid})`}
            />
          ))}
        {segs.map((s, k) => (
          <path key={k} d={path(s)} className="chart-line" />
        ))}
        {segs.filter((s) => s.length === 1).map((s, k) => (
          <circle key={`d${k}`} cx={x(s[0].i)} cy={y(s[0].v)} r={3} className="chart-dot" />
        ))}
        {data.map((d, i) =>
          i % every === 0 ? (
            <text key={d.key} x={x(i)} y={height - 6} textAnchor="middle" className="chart-axis">
              {d.label}
            </text>
          ) : null,
        )}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} className="chart-crosshair" />
            {data[hover].value != null && (
              <circle cx={x(hover)} cy={y(data[hover].value!)} r={5} className="chart-dot chart-dot--active" />
            )}
          </g>
        )}
        <rect
          x={padL}
          y={padT}
          width={Math.max(1, iw)}
          height={ih}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
        />
      </svg>
      {hover != null && (
        <Tooltip x={x(hover)} width={width}>
          {data[hover].tip ?? (
            <>
              <strong>{data[hover].value != null ? yFormat(data[hover].value!) : 'No data'}</strong>
              <span>{data[hover].label}</span>
            </>
          )}
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sleep window chart: floating bars from bedtime to wake on a night axis
// ---------------------------------------------------------------------------

export interface WindowDatum {
  key: string;
  label: string;
  bed: number | null; // night-axis minutes (e.g. 23:00 → 1380, 01:00 → 1500)
  wake: number | null; // night-axis minutes (> bed)
  tip?: ReactNode;
}

export function SleepWindowChart({
  data,
  height = 220,
  targetBed,
  targetWake,
  clockFormat,
  ariaLabel,
}: {
  data: WindowDatum[];
  height?: number;
  targetBed?: number;
  targetWake?: number;
  clockFormat: (clockMin: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 46;
  const padR = 6;
  const padT = 10;
  const padB = 22;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const vals = data.flatMap((d) => (d.bed != null && d.wake != null ? [d.bed, d.wake] : []));
  if (targetBed != null) vals.push(targetBed);
  if (targetWake != null) vals.push(targetWake);
  const lo = Math.floor(((vals.length ? Math.min(...vals) : 1320) - 30) / 60) * 60;
  const hi = Math.ceil(((vals.length ? Math.max(...vals) : 1920) + 30) / 60) * 60;
  // Time runs top → bottom (evening at the top), like a night calendar.
  const y = (v: number) => padT + ((v - lo) / (hi - lo)) * ih;
  const span = hi - lo;
  const tickStep = span > 900 ? 180 : span > 480 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) ticks.push(t);
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(18, slot - 3));
  const every = Math.max(1, Math.ceil(data.length / Math.max(4, Math.floor(iw / 44))));

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart-axis">
              {clockFormat(t % MIN_PER_DAY)}
            </text>
          </g>
        ))}
        {targetBed != null && targetWake != null && (
          <rect
            x={padL}
            width={iw}
            y={y(targetBed)}
            height={Math.max(0, y(targetWake) - y(targetBed))}
            className="chart-target-band"
          />
        )}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={d.key}>
              {d.bed != null && d.wake != null && (
                <rect
                  x={cx - bw / 2}
                  y={y(d.bed)}
                  width={bw}
                  height={Math.max(2, y(d.wake) - y(d.bed))}
                  rx={Math.min(4, bw / 2)}
                  className={`chart-window ${hover === i ? 'is-active' : ''}`}
                />
              )}
              {i % every === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle" className="chart-axis">
                  {d.label}
                </text>
              )}
              <rect
                x={padL + slot * i}
                y={padT}
                width={slot}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <Tooltip x={padL + slot * hover + slot / 2} width={width}>
          {data[hover].tip ?? <span>{data[hover].label}: no data</span>}
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked stage bar
// ---------------------------------------------------------------------------

export function StackedBar({
  segments,
  height = 14,
  ariaLabel,
}: {
  segments: { key: string; value: number; className: string; label: string }[];
  height?: number;
  ariaLabel: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="stacked" style={{ height }} role="img" aria-label={ariaLabel}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.key}
            className={`stacked__seg ${s.className}`}
            style={{ flexGrow: s.value / total }}
            title={`${s.label}: ${Math.round((s.value / total) * 100)}%`}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline (tiny, no axes)
// ---------------------------------------------------------------------------

export function Sparkline({ values, width = 96, height = 28 }: { values: (number | null)[]; width?: number; height?: number }) {
  const vs = values.filter((v): v is number => v != null);
  if (vs.length < 2) return null;
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const n = values.length;
  const pts = values
    .map((v, i) => (v == null ? null : `${(i / (n - 1)) * (width - 4) + 2},${height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)}`))
    .filter(Boolean);
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden>
      <polyline points={pts.join(' ')} fill="none" />
    </svg>
  );
}
