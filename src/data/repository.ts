import type { ActiveSession, JournalEntry, NightRecording, Settings, SleepRecord } from './types';

/**
 * Storage abstraction. The app only talks to this interface, so swapping
 * LocalStorage for Supabase means implementing one class (see supabaseRepository.example.ts).
 * All methods are async to match a network-backed implementation.
 */
export interface SleepRepository {
  listRecords(): Promise<SleepRecord[]>;
  upsertRecord(record: SleepRecord): Promise<void>;
  upsertRecords(records: SleepRecord[]): Promise<void>;
  deleteRecord(id: string): Promise<void>;

  listJournal(): Promise<JournalEntry[]>;
  upsertJournal(entry: JournalEntry): Promise<void>;
  deleteJournal(id: string): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  getActiveSession(): Promise<ActiveSession | null>;
  setActiveSession(session: ActiveSession | null): Promise<void>;

  /** Audio clip blobs (Supabase: Storage bucket). */
  saveClip(id: string, blob: Blob): Promise<void>;
  getClip(id: string): Promise<Blob | null>;
  deleteClips(ids: string[]): Promise<void>;
  listClipIds(): Promise<string[]>;

  /** In-progress overnight recording, so a reload doesn't lose the night. */
  getLiveRecording(): Promise<NightRecording | null>;
  setLiveRecording(rec: NightRecording | null): Promise<void>;

  clearAll(): Promise<void>;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
