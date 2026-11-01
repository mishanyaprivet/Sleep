import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { NightRecording } from '../data/types';
import { NightRecorder, micSupported, requestMotionPermission, type LiveStats } from '../lib/recorder';
import { useStore } from './store';
import { useUI } from './ui';

export type RecordingStatus = 'idle' | 'starting' | 'recording' | 'interrupted' | 'stopped' | 'error';

interface RecordingValue {
  status: RecordingStatus;
  live: LiveStats | null;
  error: string | null;
  supported: boolean;
  /** Begin a sleep session (and recording, if enabled). Call directly from a click. */
  beginNight: () => Promise<void>;
  /** Start/resume recording for the current session. Call directly from a click. */
  startRecording: () => Promise<void>;
  /** Stop recording and open the morning form. */
  finishNight: () => Promise<void>;
  getClipUrl: (id: string) => Promise<string | null>;
}

const Ctx = createContext<RecordingValue | null>(null);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const { ready, repository, session, settings, records, startSession, importRecords } = useStore();
  const { openRecordForm, toast } = useUI();
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [live, setLive] = useState<LiveStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<NightRecording | null>(null);
  const rec = useRef<NightRecorder | null>(null);
  const urls = useRef(new Map<string, string>());

  // Restore state after load / reload.
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const stored = await repository.getLiveRecording();
      if (!session) {
        if (stored) await repository.setLiveRecording(null);
        rec.current?.dispose();
        rec.current = null;
        setPending(null);
        setLive(null);
        setStatus('idle');
        return;
      }
      if (rec.current) return;
      if (stored && stored.startedAt === session.startedAt) {
        setPending(stored);
        setStatus('interrupted');
      } else {
        setStatus('idle');
      }
    })();
  }, [ready, session, repository]);

  // Periodically persist the in-progress night.
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => {
      if (rec.current) void repository.setLiveRecording(rec.current.snapshot());
    }, 60_000);
    return () => clearInterval(id);
  }, [status, repository]);

  // Housekeeping: retention + orphaned clips.
  const cleaned = useRef(false);
  useEffect(() => {
    if (!ready || cleaned.current) return;
    cleaned.current = true;
    void (async () => {
      try {
        const days = settings.recording.retentionDays;
        const cutoff = Date.now() - days * 86_400_000;
        const expired: string[] = [];
        const updated = [];
        if (days > 0) {
          for (const r of records) {
            const clips = r.recording?.clips ?? [];
            const old = clips.filter((c) => new Date(c.at).getTime() < cutoff);
            if (old.length) {
              expired.push(...old.map((c) => c.id));
              updated.push({ ...r, recording: { ...r.recording!, clips: clips.filter((c) => !old.includes(c)) } });
            }
          }
        }
        if (updated.length) await importRecords(updated);
        const referenced = new Set(records.flatMap((r) => r.recording?.clips.map((c) => c.id) ?? []));
        const liveRec = await repository.getLiveRecording();
        liveRec?.clips.forEach((c) => referenced.add(c.id));
        expired.forEach((id) => referenced.delete(id));
        const orphans = (await repository.listClipIds()).filter((id) => !referenced.has(id));
        await repository.deleteClips(orphans);
      } catch {
        /* storage unavailable — skip */
      }
    })();
  }, [ready, records, settings.recording.retentionDays, repository, importRecords]);

  const launch = useCallback(
    async (startedAt: string, prior: NightRecording | null) => {
      const motionP = requestMotionPermission(); // must stay synchronous in the gesture
      if (!micSupported()) {
        setStatus('error');
        setError('This browser can’t access the microphone.');
        return;
      }
      setStatus('starting');
      setError(null);
      const r = new NightRecorder({
        startedAt,
        prior,
        sensitivity: settings.recording.sensitivity,
        keepClips: settings.recording.keepClips,
        saveClip: (clip, blob) => repository.saveClip(clip.id, blob),
        deleteClip: (id) => repository.deleteClips([id]),
        onUpdate: setLive,
      });
      try {
        const { motion } = await r.start(motionP);
        rec.current = r;
        setPending(null);
        setStatus('recording');
        setLive(r.live());
        await repository.setLiveRecording(r.snapshot());
        if (!motion) toast('Recording sound only — motion sensor not available on this device');
      } catch (e) {
        r.dispose();
        setStatus(prior ? 'interrupted' : 'error');
        const name = (e as Error).name;
        setError(
          name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in your browser’s site settings to record.'
            : 'Couldn’t start the microphone.',
        );
      }
    },
    [repository, settings.recording, toast],
  );

  const beginNight = useCallback(async () => {
    const at = new Date();
    if (settings.recording.enabled) {
      const p = launch(at.toISOString(), null);
      await startSession(at);
      await p;
    } else {
      await startSession(at);
    }
  }, [settings.recording.enabled, launch, startSession]);

  const startRecording = useCallback(async () => {
    if (!session || rec.current) return;
    await launch(session.startedAt, pending);
  }, [session, pending, launch]);

  const finishNight = useCallback(async () => {
    if (!session) return;
    let result: NightRecording | null = pending;
    if (rec.current) {
      result = await rec.current.stop();
      rec.current = null;
      setLive(null);
      await repository.setLiveRecording(result);
      setPending(result);
      setStatus('stopped');
    }
    openRecordForm({
      prefill: { bedtime: session.startedAt, wakeTime: new Date().toISOString(), timezone: session.timezone, recording: result },
      fromSession: true,
    });
  }, [session, pending, repository, openRecordForm]);

  const getClipUrl = useCallback(
    async (id: string) => {
      const cached = urls.current.get(id);
      if (cached) return cached;
      const blob = await repository.getClip(id);
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      urls.current.set(id, u);
      return u;
    },
    [repository],
  );

  useEffect(() => () => rec.current?.dispose(), []);

  return (
    <Ctx.Provider
      value={{ status, live, error, supported: micSupported(), beginNight, startRecording, finishNight, getClipUrl }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRecording() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRecording must be used inside <RecordingProvider>');
  return v;
}
