import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlarmClock, Sunrise } from 'lucide-react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useClock } from '../state/format';
import { useRecording } from '../state/recording';
import { alarmPhase, notify, playChime } from '../lib/alarm';
import { clockDiff, clockMinutesInZone, deviceTimeZone, normalizeClock, parseHHmm, todayKey } from '../lib/time';
import { Button } from './ui';
import { StarField } from './Illustrations';

const FIRED_KEY = 'lumen.v1.firedReminders';

function firedSet(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
  } catch {
    return {};
  }
}
function markFired(kind: string, date: string) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ ...firedSet(), [kind]: date }));
  } catch {
    /* ignore */
  }
}

/**
 * Runs bedtime reminders and the gentle-wake smart alarm while the app is open.
 * The alarm only arms during an active sleep session.
 */
export function AlarmController() {
  const { settings, session, now } = useStore();
  const { toast } = useUI();
  const { finishNight } = useRecording();
  const { clock } = useClock();
  const [ringing, setRinging] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const lastChime = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Bedtime reminders.
  useEffect(() => {
    const tz = deviceTimeZone();
    const nowClock = clockMinutesInZone(tick, tz);
    const today = todayKey(tz);
    const fired = firedSet();
    const target = parseHHmm(settings.targetBedtime);
    const check = (kind: string, at: number, title: string, body: string) => {
      const d = clockDiff(nowClock, at);
      if (d >= 0 && d < 30 && fired[kind] !== today && !session) {
        markFired(kind, today);
        if (!notify(title, body)) toast(`${title} — ${body}`);
      }
    };
    if (settings.bedtimeReminder) {
      check(
        'bedtime',
        normalizeClock(target - settings.reminderLeadMin),
        'Time to wind down',
        `Your target bedtime is ${clock(target)}. Dim the lights and put screens away.`,
      );
    }
    if (settings.windDownReminder) {
      check('lightsOut', target, 'It’s bedtime', 'Start a sleep session in Lumen when you get into bed.');
    }
  }, [tick, settings, session, toast, clock]);

  // Smart alarm (gentle wake).
  useEffect(() => {
    const a = settings.smartAlarm;
    if (!a.enabled || !session) {
      if (ringing) setRinging(false);
      return;
    }
    const tz = session.timezone;
    const sessionMin = (tick - new Date(session.startedAt).getTime()) / 60_000;
    if (sessionMin < 60) return; // never ring in the first hour of a session
    if (dismissedFor === session.startedAt) return;
    if (snoozeUntil && tick < snoozeUntil) return;
    const phase = alarmPhase(a, clockMinutesInZone(tick, tz));
    if (phase === 'window' || phase === 'due' || (snoozeUntil && tick >= snoozeUntil)) {
      if (!ringing) {
        setRinging(true);
        notify('Good morning', `Your wake window has started (latest ${clock(parseHHmm(a.time))}).`);
      }
    }
  }, [tick, settings.smartAlarm, session, snoozeUntil, ringing, clock, dismissedFor]);

  // While ringing: chimes ramp in volume through the window.
  useEffect(() => {
    if (!ringing) return;
    const a = settings.smartAlarm;
    const play = () => {
      const tz = session?.timezone ?? deviceTimeZone();
      const toLatest = clockDiff(clockMinutesInZone(Date.now(), tz), parseHHmm(a.time));
      const progress = Math.max(0, Math.min(1, 1 + toLatest / Math.max(1, a.windowMin)));
      const vol = 0.15 + 0.85 * progress;
      if (Date.now() - lastChime.current > 4000) {
        lastChime.current = Date.now();
        playChime(a.sound, vol);
      }
    };
    play();
    const id = setInterval(play, 6000);
    return () => clearInterval(id);
  }, [ringing, settings.smartAlarm, session]);

  if (!ringing || !session) return null;
  const a = settings.smartAlarm;
  const latest = parseHHmm(a.time);
  return createPortal(
    <div className="alarm" role="alertdialog" aria-label="Wake-up alarm">
      <StarField count={40} />
      <div className="alarm__sun" aria-hidden />
      <div className="alarm__content">
        <Sunrise size={36} />
        <div className="alarm__time">{clock(clockMinutesInZone(now, session.timezone))}</div>
        <p className="alarm__msg">Good morning. Your wake window is {clock(normalizeClock(latest - a.windowMin))}–{clock(latest)}.</p>
        <div className="alarm__actions">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setRinging(false);
              setSnoozeUntil(null);
              setDismissedFor(session.startedAt);
              void finishNight();
            }}
          >
            I’m up
          </Button>
          <Button
            variant="ghost"
            size="lg"
            icon={<AlarmClock size={18} />}
            onClick={() => {
              setRinging(false);
              setSnoozeUntil(Date.now() + 9 * 60_000);
            }}
          >
            Snooze 9 min
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
