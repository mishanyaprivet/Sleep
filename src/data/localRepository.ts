import type { SleepRepository } from './repository';
import { DEFAULT_SETTINGS, type ActiveSession, type JournalEntry, type NightRecording, type Settings, type SleepRecord } from './types';
import { clipStore } from './clipStore';

const PREFIX = 'lumen.v1.';
const KEYS = {
  records: `${PREFIX}records`,
  journal: `${PREFIX}journal`,
  settings: `${PREFIX}settings`,
  session: `${PREFIX}activeSession`,
  live: `${PREFIX}liveRecording`,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Lumen: failed to persist', key, e);
    throw new Error('Could not save — your browser storage may be full or disabled.');
  }
}

export class LocalStorageRepository implements SleepRepository {
  async listRecords() {
    return read<SleepRecord[]>(KEYS.records, []);
  }
  async upsertRecord(record: SleepRecord) {
    await this.upsertRecords([record]);
  }
  async upsertRecords(records: SleepRecord[]) {
    const all = read<SleepRecord[]>(KEYS.records, []);
    const byId = new Map(all.map((r) => [r.id, r]));
    for (const r of records) byId.set(r.id, r);
    write(KEYS.records, [...byId.values()]);
  }
  async deleteRecord(id: string) {
    write(KEYS.records, read<SleepRecord[]>(KEYS.records, []).filter((r) => r.id !== id));
  }

  async listJournal() {
    return read<JournalEntry[]>(KEYS.journal, []);
  }
  async upsertJournal(entry: JournalEntry) {
    const all = read<JournalEntry[]>(KEYS.journal, []).filter((e) => e.id !== entry.id && e.date !== entry.date);
    write(KEYS.journal, [...all, entry]);
  }
  async deleteJournal(id: string) {
    write(KEYS.journal, read<JournalEntry[]>(KEYS.journal, []).filter((e) => e.id !== id));
  }

  async getSettings(): Promise<Settings> {
    const s = read<Partial<Settings>>(KEYS.settings, {});
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      smartAlarm: { ...DEFAULT_SETTINGS.smartAlarm, ...(s.smartAlarm ?? {}) },
      recording: { ...DEFAULT_SETTINGS.recording, ...(s.recording ?? {}) },
    };
  }
  async saveSettings(settings: Settings) {
    write(KEYS.settings, settings);
  }

  async getActiveSession() {
    return read<ActiveSession | null>(KEYS.session, null);
  }
  async setActiveSession(session: ActiveSession | null) {
    write(KEYS.session, session);
  }

  async saveClip(id: string, blob: Blob) {
    await clipStore.put(id, blob);
  }
  async getClip(id: string) {
    return clipStore.get(id);
  }
  async deleteClips(ids: string[]) {
    if (ids.length) await clipStore.delete(ids);
  }
  async listClipIds() {
    return clipStore.keys();
  }

  async getLiveRecording() {
    return read<NightRecording | null>(KEYS.live, null);
  }
  async setLiveRecording(rec: NightRecording | null) {
    write(KEYS.live, rec);
  }

  async clearAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    try {
      await clipStore.clear();
    } catch {
      /* IndexedDB unavailable */
    }
  }
}
