import { useRef, useState } from 'react';
import {
  AlarmClock,
  Bell,
  Database,
  Download,
  HeartPulse,
  Info,
  Palette,
  Play,
  Target,
  Trash2,
  Upload,
  User,
  Watch,
} from 'lucide-react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useClock } from '../state/format';
import { Button, Card, CardHeader, Field, Segmented, Stepper, Toggle, Pill } from '../components/ui';
import { csvToRecords, downloadText, recordsToCsv } from '../data/csv';
import { notificationsSupported, playChime, requestNotificationPermission, unlockAudio } from '../lib/alarm';
import { formatDuration, normalizeClock, parseHHmm, toHHmm } from '../lib/time';
import type { SmartAlarmSettings } from '../data/types';

export function ProfilePage() {
  const { settings, updateSettings, records, journal, importRecords, clearAll, today } = useStore();
  const { toast, confirm } = useUI();
  const { clock } = useClock();
  const fileRef = useRef<HTMLInputElement>(null);
  const [perm, setPerm] = useState<string>(notificationsSupported() ? Notification.permission : 'unsupported');
  const alarm = settings.smartAlarm;
  const setAlarm = (p: Partial<SmartAlarmSettings>) => updateSettings({ smartAlarm: { ...alarm, ...p } });

  const suggestedBed = normalizeClock(parseHHmm(settings.targetWake) - settings.goalMin - 15);

  const enableReminder = async (v: boolean, key: 'bedtimeReminder' | 'windDownReminder') => {
    if (v && notificationsSupported() && Notification.permission === 'default') {
      setPerm(await requestNotificationPermission());
    }
    await updateSettings({ [key]: v });
  };

  const onImport = async (file: File) => {
    try {
      const { records: rs, skipped } = csvToRecords(await file.text());
      if (!rs.length) return toast('No valid nights found in that file');
      const ok = await confirm({
        title: `Import ${rs.length} nights?`,
        body: `${skipped ? `${skipped} invalid rows will be skipped. ` : ''}Imported nights are added alongside your existing data.`,
        confirmLabel: 'Import',
      });
      if (!ok) return;
      await importRecords(rs);
      toast(`Imported ${rs.length} nights`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'Delete all data?',
      body: `This permanently removes ${records.length} nights, ${journal.length} journal entries and your settings from this device. Export a CSV first if you want a backup.`,
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (ok) {
      await clearAll();
      toast('All data deleted');
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Goals, alarm & settings</p>
          <h1 className="page-title">Profile</h1>
        </div>
      </header>

      <div className="grid-2">
        <Card>
          <CardHeader title="You" icon={<User size={16} />} />
          <Field label="Name" htmlFor="p-name" hint="Used for your greeting only.">
            <input
              id="p-name"
              className="input"
              value={settings.name}
              maxLength={40}
              placeholder="Your first name"
              onChange={(e) => updateSettings({ name: e.target.value })}
            />
          </Field>
        </Card>

        <Card>
          <CardHeader title="Sleep goals" icon={<Target size={16} />} />
          <div className="stack">
            <Field label={<>Nightly sleep goal <strong className="field__value">{formatDuration(settings.goalMin)}</strong></>} htmlFor="p-goal">
              <input
                id="p-goal"
                type="range"
                className="range"
                min={300}
                max={660}
                step={15}
                value={settings.goalMin}
                onChange={(e) => updateSettings({ goalMin: Number(e.target.value) })}
              />
              <div className="range-scale">
                <span>5h</span>
                <span>7h</span>
                <span>9h</span>
                <span>11h</span>
              </div>
            </Field>
            <div className="time-pair">
              <Field label="Target bedtime" htmlFor="p-bed">
                <input id="p-bed" type="time" className="input input--time" value={settings.targetBedtime} onChange={(e) => e.target.value && updateSettings({ targetBedtime: e.target.value })} />
              </Field>
              <Field label="Target wake-up" htmlFor="p-wake">
                <input id="p-wake" type="time" className="input input--time" value={settings.targetWake} onChange={(e) => e.target.value && updateSettings({ targetWake: e.target.value })} />
              </Field>
            </div>
            {toHHmm(suggestedBed) !== settings.targetBedtime && (
              <button type="button" className="suggest" onClick={() => updateSettings({ targetBedtime: toHHmm(suggestedBed) })}>
                <Info size={14} /> For a {clock(parseHHmm(settings.targetWake))} wake-up and your goal, try <strong>{clock(suggestedBed)}</strong> (incl. 15 min to fall asleep). Apply
              </button>
            )}
            <Field label="Weekly goal" hint="Nights per week you aim to meet your sleep goal.">
              <Stepper label="nights per week" value={settings.weeklyGoalNights} onChange={(v) => updateSettings({ weeklyGoalNights: v ?? 1 })} min={1} max={7} unit="nights" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Reminders" icon={<Bell size={16} />} />
          <div className="stack">
            <Toggle
              checked={settings.bedtimeReminder}
              onChange={(v) => enableReminder(v, 'bedtimeReminder')}
              label="Wind-down reminder"
              description={`${settings.reminderLeadMin} min before your ${clock(parseHHmm(settings.targetBedtime))} bedtime`}
            />
            {settings.bedtimeReminder && (
              <Segmented
                label="Reminder lead time"
                size="sm"
                value={settings.reminderLeadMin}
                onChange={(v) => updateSettings({ reminderLeadMin: v })}
                options={[15, 30, 45, 60].map((m) => ({ value: m, label: `${m}m` }))}
              />
            )}
            <Toggle
              checked={settings.windDownReminder}
              onChange={(v) => enableReminder(v, 'windDownReminder')}
              label="Bedtime reminder"
              description="At your target bedtime"
            />
            <div className="perm">
              <span>Browser notifications</span>
              {perm === 'granted' ? (
                <Pill tone="good">Allowed</Pill>
              ) : perm === 'denied' ? (
                <Pill tone="warn">Blocked in browser settings</Pill>
              ) : perm === 'unsupported' ? (
                <Pill>Not supported</Pill>
              ) : (
                <Button size="sm" onClick={async () => setPerm(await requestNotificationPermission())}>
                  Allow
                </Button>
              )}
            </div>
            <p className="hint-line">
              <Info size={13} /> Reminders fire while Lumen is open in a tab. Without notification permission they appear as
              in-app banners.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Smart alarm" icon={<AlarmClock size={16} />} subtitle="Gentle wake within a window" />
          <div className="stack">
            <Toggle
              checked={alarm.enabled}
              onChange={(v) => {
                unlockAudio();
                setAlarm({ enabled: v });
              }}
              label="Gentle wake alarm"
              description={alarm.enabled ? `Between ${clock(normalizeClock(parseHHmm(alarm.time) - alarm.windowMin))} and ${clock(parseHHmm(alarm.time))}` : 'Off'}
            />
            <div className="time-pair">
              <Field label="Wake up by" htmlFor="p-alarm">
                <input id="p-alarm" type="time" className="input input--time" value={alarm.time} onChange={(e) => e.target.value && setAlarm({ time: e.target.value })} />
              </Field>
              <Field label="Sound">
                <div className="row-tight">
                  <select className="input" value={alarm.sound} onChange={(e) => setAlarm({ sound: e.target.value as SmartAlarmSettings['sound'] })} aria-label="Alarm sound">
                    <option value="chime">Soft chime</option>
                    <option value="bowl">Singing bowl</option>
                    <option value="birds">Morning birds</option>
                  </select>
                  <Button size="sm" variant="ghost" icon={<Play size={14} />} onClick={() => playChime(alarm.sound, 0.7)} aria-label="Preview sound" />
                </div>
              </Field>
            </div>
            <Field label="Wake window">
              <Segmented
                label="Wake window"
                size="sm"
                value={alarm.windowMin}
                onChange={(v) => setAlarm({ windowMin: v })}
                options={[10, 20, 30, 45].map((m) => ({ value: m, label: `${m} min` }))}
              />
            </Field>
            {alarm.time !== settings.targetWake && (
              <button type="button" className="suggest" onClick={() => setAlarm({ time: settings.targetWake })}>
                <Info size={14} /> Match your target wake-up ({clock(parseHHmm(settings.targetWake))})
              </button>
            )}
            <div className="explainer explainer--box">
              <p>
                <strong>How it works.</strong> When you start a sleep session, the alarm arms. At the start of your window it
                begins playing quiet chimes that slowly get louder, reaching full volume at your wake-up time.
              </p>
              <p>
                <strong>What it can’t do.</strong> Lumen has no access to motion or heart-rate sensors, so it{' '}
                <em>cannot detect your sleep stage</em> or pick the “optimal” light-sleep moment. The window gives a gradual
                wake instead. Keep this tab open, the screen allowed to stay on, and your device’s volume up.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Preferences" icon={<Palette size={16} />} />
          <div className="stack">
            <Field label="Clock">
              <Segmented label="Clock format" value={settings.clock} onChange={(v) => updateSettings({ clock: v })} options={[{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' }]} />
            </Field>
            <Field label="Appearance">
              <Segmented label="Theme" value={settings.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'dark', label: 'Midnight' }, { value: 'light', label: 'Dawn' }]} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Health integrations" icon={<HeartPulse size={16} />} />
          <ul className="integrations">
            {['Apple Health', 'Google Health Connect', 'Oura', 'Fitbit'].map((n) => (
              <li key={n}>
                <Watch size={16} />
                <span>{n}</span>
                <Pill>Not available</Pill>
              </li>
            ))}
          </ul>
          <p className="hint-line">
            <Info size={13} /> Direct sync needs a native app or cloud backend. Until then, enter stage minutes manually when
            editing a night, or import a CSV in Lumen’s format (see Export for the columns).
          </p>
        </Card>

        <Card className="span-2">
          <CardHeader title="Your data" icon={<Database size={16} />} subtitle={`${records.length} nights · ${journal.length} journal entries · stored only in this browser`} />
          <div className="data-actions">
            <Button
              icon={<Download size={16} />}
              onClick={() => {
                if (!records.length) return toast('Nothing to export yet');
                downloadText(`lumen-sleep-${today}.csv`, recordsToCsv(records, journal, settings.goalMin));
              }}
            >
              Export CSV
            </Button>
            <Button icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
              Import CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={wipe}>
              Delete all data
            </Button>
          </div>
          <p className="disclaimer">
            Lumen is a personal wellness tool. Scores and insights are derived from what you enter and are not medical
            measurements or advice. If you have ongoing sleep problems, talk to a healthcare professional.
          </p>
        </Card>
      </div>
    </div>
  );
}
