import type { ActiveSession, JournalEntry, Settings, SleepRecord } from './types';

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

  clearAll(): Promise<void>;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
