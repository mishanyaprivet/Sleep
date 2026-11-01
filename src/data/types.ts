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
  /** Overnight sound & motion recording summary (from this device's mic/accelerometer). */
  recording?: NightRecording | null;
  source: 'manual' | 'session' | 'import';
  createdAt: string;
  updatedAt: string;
}

/** One minute of an overnight recording. `db` null = no data (tab hidden / paused). */
export interface SoundEpoch {
  /** Minutes since recording start. */
  m: number;
  /** Mean level, dBFS (uncalibrated, relative). */
  db: number | null;
  peak: number | null;
  /** Seconds of probable snoring within this minute. */
  snore: number;
  /** Non-snore sound events. */
  events: number;
  /** Share of motion samples showing movement (0–1); null when no motion sensor. */
  motion: number | null;
}

export interface SoundClip {
  id: string;
  /** ISO instant the clip starts. */
  at: string;
  durationSec: number;
  kind: 'snore' | 'noise';
  /** Peak level above the room's quiet floor, dB. */
  peakAboveFloor: number;
}

export type RecordingSensitivity = 'low' | 'medium' | 'high';

export interface NightRecording {
  startedAt: string;
  endedAt: string;
  epochs: SoundEpoch[];
  snoreMin: number;
  snoreEpisodes: number;
  noiseEvents: number;
  /** Quiet-room floor (10th percentile of minute levels), dBFS. */
  floorDb: number | null;
  peakAboveFloor: number | null;
  motionAvailable: boolean;
  gapsMin: number;
  clips: SoundClip[];
  sensitivity: RecordingSensitivity;
}

export interface RecordingSettings {
  enabled: boolean;
  sensitivity: RecordingSensitivity;
  keepClips: boolean;
  /** Delete clips older than N days; 0 = keep forever. */
  retentionDays: number;
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
  recording: RecordingSettings;
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
  recording: { enabled: true, sensitivity: 'medium', keepClips: true, retentionDays: 30 },
  clock: '24h',
  theme: 'dark',
  onboarded: false,
};
