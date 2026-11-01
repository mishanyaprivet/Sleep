import { useMemo } from 'react';

/** Deterministic pseudo-random generator so the star field is stable across renders. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function StarField({ count = 70 }: { count?: number }) {
  const stars = useMemo(() => {
    const r = rng(42);
    return Array.from({ length: count }, (_, i) => ({
      i,
      x: r() * 100,
      y: r() * 100,
      s: r() < 0.12 ? 2 : r() < 0.5 ? 1.4 : 1,
      d: (r() * 6).toFixed(2),
      o: 0.25 + r() * 0.6,
    }));
  }, [count]);
  return (
    <div className="starfield" aria-hidden>
      {stars.map((s) => (
        <span
          key={s.i}
          className="star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            opacity: s.o,
            animationDelay: `${s.d}s`,
          }}
        />
      ))}
    </div>
  );
}

export function Moon({ size = 56, phase = 0.62 }: { size?: number; phase?: number }) {
  // A soft crescent: a lit disc with a shadow disc offset by `phase`.
  const off = size * phase;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="moon" aria-hidden>
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--moon-glow)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--moon-glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="moonFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#efeaff" />
          <stop offset="100%" stopColor="#b7b2ff" />
        </linearGradient>
        <mask id={`moonMask${size}`}>
          <rect width={size} height={size} fill="white" />
          <circle cx={size / 2 + off * 0.45} cy={size / 2 - off * 0.25} r={size * 0.3} fill="black" />
        </mask>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#moonGlow)" />
      <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="url(#moonFill)" mask={`url(#moonMask${size})`} />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#d6d0ff" />
            <stop offset="1" stopColor="#7f8cff" />
          </linearGradient>
        </defs>
        <path d="M15 3a9 9 0 1 0 6 13.5A7.2 7.2 0 0 1 15 3z" fill="url(#lg)" />
        <circle cx="18.5" cy="5.5" r="1" fill="#d6d0ff" />
      </svg>
      Lumen
    </span>
  );
}
