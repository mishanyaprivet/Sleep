import { useId, type ReactNode, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { Minus, Plus } from 'lucide-react';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

export function Card({
  children,
  className,
  style,
  as: As = 'section',
  glow,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: 'section' | 'div' | 'article';
  glow?: boolean;
}) {
  return (
    <As className={cx('card', glow && 'card--glow', className)} style={style}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="card-header">
      <div className="card-header__text">
        <h2 className="card-title">
          {icon && <span className="card-title__icon">{icon}</span>}
          {title}
        </h2>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="card-header__action">{action}</div>}
    </header>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  block,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', className)}
      {...rest}
    >
      {icon && <span className="btn__icon">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('icon-btn', className)} {...rest}>
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className={cx('segmented', `segmented--${size}`)}
      role="radiogroup"
      aria-label={label}
      style={{ '--seg-count': options.length, '--seg-index': idx } as CSSProperties}
    >
      <span className="segmented__thumb" aria-hidden />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx('segmented__opt', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'warn' | 'muted';
}) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {sub && <div className={cx('stat__sub', tone && `tone-${tone}`)}>{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'accent' }) {
  return <span className={cx('pill', `pill--${tone}`)}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <div className="empty__title">{title}</div>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={cx('toggle-row', disabled && 'is-disabled')} htmlFor={id}>
      <span className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {description && <span className="toggle-row__desc">{description}</span>}
      </span>
      <span className="toggle">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle__track" aria-hidden>
          <span className="toggle__thumb" />
        </span>
      </span>
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  label,
  allowEmpty,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label: string;
  allowEmpty?: boolean;
}) {
  const v = value ?? 0;
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper__btn"
        aria-label={`Decrease ${label}`}
        onClick={() => {
          if (allowEmpty && value != null && value - step < min) onChange(null);
          else onChange(Math.max(min, v - step));
        }}
        disabled={!allowEmpty ? v <= min : value == null}
      >
        <Minus size={16} />
      </button>
      <span className={cx('stepper__value', value == null && 'is-empty')} aria-live="polite">
        {value == null ? '—' : value}
        {value != null && unit && <small> {unit}</small>}
      </span>
      <button
        type="button"
        className="stepper__btn"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value == null ? min : Math.min(max, v + step))}
        disabled={v >= max}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

/** 1–5 picker with custom icons per level. */
export function ScalePicker({
  value,
  onChange,
  label,
  icons,
  labels,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  label: string;
  icons: ReactNode[];
  labels: string[];
}) {
  return (
    <div className="scale" role="radiogroup" aria-label={label}>
      {icons.map((ic, i) => {
        const v = i + 1;
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={labels[i]}
            title={labels[i]}
            className={cx('scale__opt', active && 'is-active')}
            onClick={() => onChange(active ? null : v)}
          >
            <span className="scale__icon">{ic}</span>
            <span className="scale__label">{labels[i]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, max = 1, label }: { value: number; max?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Delta({ value, unit = 'min', invert, format }: { value: number | null; unit?: string; invert?: boolean; format?: (v: number) => string }) {
  if (value == null || !Number.isFinite(value)) return <span className="delta">—</span>;
  const r = Math.round(value);
  const good = invert ? r < 0 : r > 0;
  const cls = r === 0 ? 'delta--flat' : good ? 'delta--up' : 'delta--down';
  const text = format ? format(r) : `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}${unit === 'min' ? 'm' : unit}`;
  return <span className={cx('delta', cls)}>{text}</span>;
}
