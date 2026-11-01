import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SleepRepository } from '../data/repository';
import { newId } from '../data/repository';
import { LocalStorageRepository } from '../data/localRepository';
import { DEFAULT_SETTINGS, type ActiveSession, type JournalEntry, type Settings, type SleepRecord } from '../data/types';
import { analyzeNights, type Night } from '../lib/sleep';
import { deviceTimeZone, todayKey } from '../lib/time';

interface StoreValue {
  ready: boolean;
  repository: SleepRepository;
  records: SleepRecord[];
  journal: JournalEntry[];
  settings: Settings;
  session: ActiveSession | null;
  nights: Night[];
  today: string;
  now: number;
  saveRecord: (r: Omit<SleepRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<SleepRecord>;
  importRecords: (rs: SleepRecord[]) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  restoreRecord: (r: SleepRecord) => Promise<void>;
  saveJournal: (e: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteJournal: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  startSession: (at?: Date) => Promise<void>;
  cancelSession: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: SleepRepository;
}) {
  const repo = useMemo(() => repository ?? new LocalStorageRepository(), [repository]);
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<SleepRecord[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    const [r, j, s, a] = await Promise.all([
      repo.listRecords(),
      repo.listJournal(),
      repo.getSettings(),
      repo.getActiveSession(),
    ]);
    setRecords(r);
    setJournal(j);
    setSettings(s);
    setSession(a);
    setReady(true);
  }, [repo]);

  useEffect(() => {
    void reload();
    // Keep multiple tabs in sync.
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('lumen.')) void reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [reload]);

  // Clock tick (drives live timers and the date rollover at midnight).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  const today = useMemo(() => todayKey(), [Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const nights = useMemo(() => analyzeNights(records, settings), [records, settings]);

  const saveRecord: StoreValue['saveRecord'] = useCallback(
    async (input) => {
      const ts = new Date().toISOString();
      const existing = input.id ? records.find((r) => r.id === input.id) : undefined;
      const rec: SleepRecord = {
        ...input,
        id: input.id ?? newId(),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      };
      await repo.upsertRecord(rec);
      setRecords((rs) => [...rs.filter((r) => r.id !== rec.id), rec]);
      return rec;
    },
    [repo, records],
  );

  const importRecords = useCallback(
    async (rs: SleepRecord[]) => {
      await repo.upsertRecords(rs);
      setRecords(await repo.listRecords());
    },
    [repo],
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      await repo.deleteRecord(id);
      setRecords((rs) => rs.filter((r) => r.id !== id));
    },
    [repo],
  );

  const restoreRecord = useCallback(
    async (r: SleepRecord) => {
      await repo.upsertRecord(r);
      setRecords((rs) => [...rs.filter((x) => x.id !== r.id), r]);
    },
    [repo],
  );

  const saveJournal: StoreValue['saveJournal'] = useCallback(
    async (input) => {
      const ts = new Date().toISOString();
      const existing = journal.find((e) => e.id === input.id || e.date === input.date);
      const entry: JournalEntry = {
        ...input,
        id: existing?.id ?? input.id ?? newId(),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      };
      await repo.upsertJournal(entry);
      setJournal((js) => [...js.filter((e) => e.id !== entry.id && e.date !== entry.date), entry]);
    },
    [repo, journal],
  );

  const deleteJournal = useCallback(
    async (id: string) => {
      await repo.deleteJournal(id);
      setJournal((js) => js.filter((e) => e.id !== id));
    },
    [repo],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await repo.saveSettings(next);
    },
    [repo, settings],
  );

  const startSession = useCallback(
    async (at = new Date()) => {
      const s = { startedAt: at.toISOString(), timezone: deviceTimeZone() };
      await repo.setActiveSession(s);
      setSession(s);
    },
    [repo],
  );

  const cancelSession = useCallback(async () => {
    await repo.setActiveSession(null);
    setSession(null);
  }, [repo]);

  const clearAll = useCallback(async () => {
    await repo.clearAll();
    await reload();
  }, [repo, reload]);

  const value: StoreValue = {
    ready,
    repository: repo,
    records,
    journal,
    settings,
    session,
    nights,
    today,
    now,
    saveRecord,
    importRecords,
    deleteRecord,
    restoreRecord,
    saveJournal,
    deleteJournal,
    updateSettings,
    startSession,
    cancelSession,
    clearAll,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}
