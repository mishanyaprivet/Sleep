import type { JournalEntry, SleepRecord } from './types';
import { newId } from './repository';
import { dateKeyInZone, deviceTimeZone, formatInstantClock, minutesBetween } from '../lib/time';
import { computeMetrics } from '../lib/sleep';

const HEADERS = [
  'date', 'bedtime_local', 'wake_local', 'bedtime_utc', 'wake_utc', 'timezone',
  'time_in_bed_min', 'latency_min', 'awake_min', 'asleep_min', 'efficiency_pct',
  'quality_1_5', 'stage_awake_min', 'stage_rem_min', 'stage_light_min', 'stage_deep_min',
  'stage_source', 'source', 'notes', 'snore_min', 'snore_episodes', 'noise_events',
  'journal_mood', 'journal_energy', 'journal_rested', 'journal_caffeine', 'journal_stress', 'journal_exercise',
] as const;

function esc(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: SleepRecord[], journal: JournalEntry[], goalMin: number): string {
  const jByDate = new Map(journal.map((j) => [j.date, j]));
  const rows = [...records]
    .sort((a, b) => a.bedtime.localeCompare(b.bedtime))
    .map((r) => {
      const m = computeMetrics(r, goalMin);
      const j = jByDate.get(m.dateKey);
      const st = r.stages;
      return [
        m.dateKey,
        formatInstantClock(r.bedtime, r.timezone),
        formatInstantClock(r.wakeTime, r.timezone),
        r.bedtime, r.wakeTime, r.timezone,
        Math.round(m.timeInBed), r.latencyMin ?? '', r.awakeMin ?? '', Math.round(m.asleep),
        m.efficiency != null ? m.efficiency.toFixed(1) : '',
        r.quality ?? '', st?.awake ?? '', st?.rem ?? '', st?.light ?? '', st?.deep ?? '',
        st ? (st.device ? `${st.source}:${st.device}` : st.source) : '',
        r.source, r.notes ?? '',
        r.recording?.snoreMin ?? '', r.recording?.snoreEpisodes ?? '', r.recording?.noiseEvents ?? '',
        j?.mood ?? '', j?.energy ?? '', j?.rested ?? '', j?.caffeine ?? '', j?.stress ?? '',
        j?.exercise == null ? '' : j.exercise ? 'yes' : 'no',
      ].map(esc).join(',');
    });
  return [HEADERS.join(','), ...rows].join('\r\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Import records from a CSV in Lumen's export format (requires bedtime_utc & wake_utc).
 * Stage columns are accepted when present — e.g. data exported from a wearable and
 * mapped into this format. Nothing is inferred or generated.
 */
export function csvToRecords(text: string): { records: SleepRecord[]; skipped: number } {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return { records: [], skipped: 0 };
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (name: string) => h.indexOf(name);
  const need = ['bedtime_utc', 'wake_utc'];
  if (need.some((n) => col(n) < 0)) throw new Error('CSV must include bedtime_utc and wake_utc columns (Lumen export format).');
  const num = (r: string[], n: string) => {
    const i = col(n);
    if (i < 0 || r[i] == null || r[i].trim() === '') return null;
    const v = Number(r[i]);
    return Number.isFinite(v) ? v : null;
  };
  const str = (r: string[], n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '');
  const now = new Date().toISOString();
  const records: SleepRecord[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const bed = new Date(str(r, 'bedtime_utc'));
    const wake = new Date(str(r, 'wake_utc'));
    const tib = minutesBetween(bed, wake);
    if (!Number.isFinite(tib) || tib <= 0 || tib > 20 * 60) { skipped++; continue; }
    const sa = num(r, 'stage_awake_min'), sr = num(r, 'stage_rem_min'), sl = num(r, 'stage_light_min'), sd = num(r, 'stage_deep_min');
    const hasStages = sr != null && sl != null && sd != null;
    const stSrc = str(r, 'stage_source');
    const tz = str(r, 'timezone') || deviceTimeZone();
    try { dateKeyInZone(bed, tz); } catch { skipped++; continue; }
    records.push({
      id: newId(),
      bedtime: bed.toISOString(),
      wakeTime: wake.toISOString(),
      timezone: tz,
      latencyMin: num(r, 'latency_min'),
      awakeMin: num(r, 'awake_min'),
      quality: num(r, 'quality_1_5'),
      notes: str(r, 'notes') || undefined,
      stages: hasStages
        ? { awake: sa ?? 0, rem: sr!, light: sl!, deep: sd!, source: 'import', device: stSrc.includes(':') ? stSrc.split(':')[1] : undefined }
        : null,
      source: 'import',
      createdAt: now,
      updatedAt: now,
    });
  }
  return { records, skipped };
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
