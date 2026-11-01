import {
  Angry,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Zap,
  Frown,
  Laugh,
  Meh,
  Smile,
  Annoyed,
  CloudLightning,
  CloudRain,
  Cloud,
  CloudSun,
  Sun,
} from 'lucide-react';
import type { ReactNode } from 'react';

const S = 20;

export const QUALITY_ICONS: ReactNode[] = [
  <CloudLightning size={S} />,
  <CloudRain size={S} />,
  <Cloud size={S} />,
  <CloudSun size={S} />,
  <Sun size={S} />,
];
export const QUALITY_LABELS = ['Very poor', 'Poor', 'Okay', 'Good', 'Great'];

export const MOOD_ICONS: ReactNode[] = [<Angry size={S} />, <Frown size={S} />, <Meh size={S} />, <Smile size={S} />, <Laugh size={S} />];
export const MOOD_LABELS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];

export const ENERGY_ICONS: ReactNode[] = [
  <BatteryWarning size={S} />,
  <BatteryLow size={S} />,
  <BatteryMedium size={S} />,
  <BatteryFull size={S} />,
  <Zap size={S} />,
];
export const ENERGY_LABELS = ['Drained', 'Low', 'Steady', 'Good', 'Charged'];

export const RESTED_LABELS = ['Exhausted', 'Tired', 'Okay', 'Rested', 'Refreshed'];
export const STRESS_LABELS = ['Calm', 'Mild', 'Moderate', 'High', 'Very high'];

export function Dots({ level, of = 5 }: { level: number; of?: number }) {
  return (
    <span className="dots" aria-hidden>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
}

export const STRESS_ICONS: ReactNode[] = [1, 2, 3, 4, 5].map((n) => <Dots key={n} level={n} />);
export const RESTED_ICONS: ReactNode[] = [<Frown size={S} />, <Annoyed size={S} />, <Meh size={S} />, <Smile size={S} />, <Laugh size={S} />];
