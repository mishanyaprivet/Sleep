/**
 * Browser-side alarm & notification helpers.
 * Limitations (surfaced in the UI): a web page can only ring while it is open,
 * and nothing here can detect sleep stages.
 */
import type { SmartAlarmSettings } from '../data/types';
import { clockDiff, parseHHmm } from './time';

let ctx: AudioContext | null = null;

/** Must be called from a user gesture (e.g. "Start sleep") so audio may play later. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unavailable */
  }
}

const SOUNDS: Record<SmartAlarmSettings['sound'], { freqs: number[]; type: OscillatorType; gap: number; decay: number }> = {
  chime: { freqs: [659.25, 783.99, 987.77, 1318.5], type: 'sine', gap: 0.35, decay: 2.2 },
  bowl: { freqs: [196, 293.66, 392], type: 'sine', gap: 0.9, decay: 5 },
  birds: { freqs: [2093, 2349.3, 2637, 2349.3, 2793.8], type: 'triangle', gap: 0.12, decay: 0.25 },
};

/** Play one soft phrase. `volume` 0–1. */
export function playChime(sound: SmartAlarmSettings['sound'], volume: number) {
  unlockAudio();
  if (!ctx) return;
  const s = SOUNDS[sound];
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = Math.max(0.02, Math.min(1, volume)) * 0.35;
  master.connect(ctx.destination);
  s.freqs.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = s.type;
    o.frequency.value = f;
    const t = now + i * s.gap;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + s.decay);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + s.decay + 0.05);
  });
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a system notification if allowed. Returns false so the caller can fall back to an in-app toast. */
export function notify(title: string, body: string): boolean {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, icon: '/moon.svg', tag: title });
    return true;
  } catch {
    return false;
  }
}

/** Where `nowClock` sits relative to the smart-alarm window (minutes; signed to latest time). */
export function alarmPhase(alarm: SmartAlarmSettings, nowClock: number): 'before' | 'window' | 'due' | 'after' {
  const toLatest = clockDiff(nowClock, parseHHmm(alarm.time)); // negative = before latest time
  if (toLatest < -alarm.windowMin) return 'before';
  if (toLatest < 0) return 'window';
  if (toLatest < 60) return 'due';
  return 'after';
}
