/**
 * Domain types. These are storage-agnostic and map 1:1 to future Supabase tables
 * (sleep_records, journal_entries, user_settings, active_sessions).
 */

export type StageKey = 'awake' | 'rem' | 'light' | 'deep';

/** Sleep-stage totals in minutes. Only ever user-entered or imported — never generated. */
export interface SleepStages {
  awake: number;
  rem: number;
  light: number;
  deep: number;
  source: 'manual' | 'import';
  /** Free-text device/app name when imported, e.g. "Oura export". */
  device?: string;
}

export interface SleepRecord {
  id: string;
  /** ISO-8601 instant (UTC) the user got into bed. */
  bedtime: string;
  /** ISO-8601 instant (UTC) the user woke up / got up. */
  wakeTime: string;
  /** IANA timezone the record was logged in; used to render local clock times. */
  timezone: string;
  /** Minutes taken to fall asleep (user-reported). */
  latencyMin?: number | null;
  /** Minutes awake after first falling asleep (WASO, user-reported). */
  awakeMin?: number | null;
  /** Number of awakenings (optional, user-reported). */
  awakenings?: number | null;
  /** Subjective quality 1–5. */
  quality?: number | null;
  notes?: string;
  stages?: SleepStages | null;
  source: 'manual' | 'session' | 'import';
  createdAt: string;
  updatedAt: string;
}

export type JournalTag =
  | 'alcohol'
  | 'lateMeal'
  | 'screens'
  | 'nap'
  | 'meditation'
  | 'travel'
  | 'reading'
  | 'sick';

export interface JournalEntry {
  id: string;
  /** Local calendar date YYYY-MM-DD this entry describes. */
  date: string;
  /** Morning check-in — about the night that ended on `date`. */
  mood?: number | null; // 1–5
  energy?: number | null; // 1–5
  rested?: number | null; // 1–5
  /** Daytime habits — linked to the night that starts on `date`. */
  caffeine?: number | null; // cups
  lastCaffeine?: string | null; // HH:mm
  exercise?: boolean | null;
  exerciseMin?: number | null;
  stress?: number | null; // 1–5
  tags: JournalTag[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmartAlarmSettings {
  enabled: boolean;
  /** HH:mm — latest wake-up time. */
  time: string;
  /** Wake window in minutes before `time`. */
  windowMin: number;
  sound: 'chime' | 'bowl' | 'birds';
}

export interface Settings {
  name: string;
  goalMin: number;
  targetBedtime: string; // HH:mm
  targetWake: string; // HH:mm
  weeklyGoalNights: number; // nights per week meeting the goal
  bedtimeReminder: boolean;
  reminderLeadMin: number;
  windDownReminder: boolean;
  smartAlarm: SmartAlarmSettings;
  clock: '12h' | '24h';
  theme: 'dark' | 'light';
  onboarded: boolean;
}

export interface ActiveSession {
  startedAt: string;
  timezone: string;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  goalMin: 480,
  targetBedtime: '23:00',
  targetWake: '07:00',
  weeklyGoalNights: 5,
  bedtimeReminder: false,
  reminderLeadMin: 30,
  windDownReminder: false,
  smartAlarm: { enabled: false, time: '07:00', windowMin: 30, sound: 'chime' },
  clock: '24h',
  theme: 'dark',
  onboarded: false,
};
