import { useStore } from './store';
import { formatClock, formatInstantClock } from '../lib/time';

export function useClock() {
  const { settings } = useStore();
  return {
    clock: (min: number) => formatClock(min, settings.clock),
    instant: (iso: string, tz: string) => formatInstantClock(iso, tz, settings.clock),
  };
}
