import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Moon as MoonIcon, Trash2, Watch } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button, Field, ScalePicker, Stepper, cx } from './ui';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useClock } from '../state/format';
import type { SleepRecord, SleepStages } from '../data/types';
import { computeMetrics, validateRecord, STAGE_LABEL, STAGE_ORDER } from '../lib/sleep';
import {
  addDays,
  dateKeyInZone,
  deviceTimeZone,
  formatDateKey,
  formatDuration,
  formatInstantClock,
  resolveNight,
  signedMinutes,
  todayKey,
} from '../lib/time';
import { QUALITY_ICONS, QUALITY_LABELS } from './icons';

interface FormState {
  wakeDate: string;
  bed: string;
  wake: string;
  latency: number | null;
  awake: number | null;
  awakenings: number | null;
  quality: number | null;
  notes: string;
  stagesOn: boolean;
  stages: { awake: string; rem: string; light: string; deep: string; device: string };
}

function initialState(
  record: Partial<SleepRecord> | undefined,
  tz: string,
  s: { targetBedtime: string; targetWake: string },
  date?: string,
): FormState {
  const hasTimes = record?.bedtime && record?.wakeTime;
  const st = record?.stages;
  return {
    wakeDate: hasTimes ? dateKeyInZone(record!.wakeTime!, tz) : (date ?? todayKey(tz)),
    bed: hasTimes ? formatInstantClock(record!.bedtime!, tz) : s.targetBedtime,
    wake: hasTimes ? formatInstantClock(record!.wakeTime!, tz) : s.targetWake,
    latency: record?.latencyMin ?? null,
    awake: record?.awakeMin ?? null,
    awakenings: record?.awakenings ?? null,
    quality: record?.quality ?? null,
    notes: record?.notes ?? '',
    stagesOn: !!st,
    stages: {
      awake: st ? String(st.awake) : '',
      rem: st ? String(st.rem) : '',
      light: st ? String(st.light) : '',
      deep: st ? String(st.deep) : '',
      device: st?.device ?? '',
    },
  };
}

export function RecordFormSheet() {
  const { recordForm, closeRecordForm, toast, confirm } = useUI();
  const { settings, saveRecord, deleteRecord, restoreRecord, cancelSession } = useStore();
  const { clock } = useClock();
  const open = !!recordForm;
  const editing = recordForm?.record;
  const source = editing ?? recordForm?.prefill;
  const tz = editing?.timezone ?? deviceTimeZone();
  const [f, setF] = useState<FormState>(() => initialState(source, tz, settings, recordForm?.date));
  const [showStages, setShowStages] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const init = initialState(source, tz, settings, recordForm?.date);
      setF(init);
      setShowStages(init.stagesOn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, recordForm?.date]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));

  const stages: SleepStages | null = useMemo(() => {
    if (!f.stagesOn) return null;
    const n = (s: string) => (s.trim() === '' ? NaN : Number(s));
    const v = { awake: n(f.stages.awake) || 0, rem: n(f.stages.rem), light: n(f.stages.light), deep: n(f.stages.deep) };
    if ([v.rem, v.light, v.deep].some((x) => !Number.isFinite(x))) return null;
    return { ...v, source: editing?.stages?.source ?? 'manual', device: f.stages.device.trim() || undefined };
  }, [f.stagesOn, f.stages, editing?.stages?.source]);

  const { bedtime, wakeTime } = useMemo(() => resolveNight(f.wakeDate, f.bed, f.wake, tz), [f.wakeDate, f.bed, f.wake, tz]);
  const draft: SleepRecord = {
    id: editing?.id ?? 'draft',
    bedtime: bedtime.toISOString(),
    wakeTime: wakeTime.toISOString(),
    timezone: tz,
    latencyMin: f.latency,
    awakeMin: f.awake,
    awakenings: f.awakenings,
    quality: f.quality,
    notes: f.notes.trim() || undefined,
    stages,
    source: editing?.source ?? (recordForm?.fromSession ? 'session' : 'manual'),
    createdAt: editing?.createdAt ?? '',
    updatedAt: '',
  };
  const m = computeMetrics(draft, settings.goalMin);
  const v = validateRecord({ bedtime, wakeTime, latencyMin: f.latency, awakeMin: f.awake, stages });
  const stagesIncomplete = f.stagesOn && !stages;
  const crossesMidnight = dateKeyInZone(bedtime, tz) !== dateKeyInZone(wakeTime, tz);

  const onSave = async () => {
    if (v.errors.length || stagesIncomplete) return;
    setBusy(true);
    try {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = draft;
      await saveRecord({ ...rest, id: editing?.id });
      if (recordForm?.fromSession) await cancelSession();
      toast(editing ? 'Night updated' : 'Night saved');
      closeRecordForm();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: 'Delete this night?',
      body: `${formatDateKey(m.dateKey, 'long')} · ${formatDuration(m.asleep)} will be removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteRecord(editing.id);
    closeRecordForm();
    toast('Night deleted', { label: 'Undo', onAction: () => void restoreRecord(editing) });
  };

  const today = todayKey(tz);
  const title = editing ? 'Edit night' : recordForm?.fromSession ? 'Good morning' : 'Log a night';
  const subtitle = recordForm?.fromSession
    ? 'Review your session and add any details before saving.'
    : tz !== deviceTimeZone()
      ? `Times shown in ${tz}, where this night was logged.`
      : undefined;

  return (
    <Sheet
      open={open}
      onClose={closeRecordForm}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          {editing && (
            <Button variant="ghost" icon={<Trash2 size={16} />} onClick={onDelete} className="btn--danger-text">
              Delete
            </Button>
          )}
          <div className="spacer" />
          <Button variant="ghost" onClick={closeRecordForm}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} disabled={busy || v.errors.length > 0 || stagesIncomplete}>
            {editing ? 'Save changes' : 'Save night'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Woke up on" htmlFor="rf-date">
          <div className="date-row">
            <input
              id="rf-date"
              type="date"
              className="input"
              value={f.wakeDate}
              max={today}
              onChange={(e) => e.target.value && set('wakeDate', e.target.value)}
            />
            <div className="chips">
              <button type="button" className={cx('chip', f.wakeDate === today && 'is-active')} onClick={() => set('wakeDate', today)}>
                Today
              </button>
              <button
                type="button"
                className={cx('chip', f.wakeDate === addDays(today, -1) && 'is-active')}
                onClick={() => set('wakeDate', addDays(today, -1))}
              >
                Yesterday
              </button>
            </div>
          </div>
        </Field>

        <div className="time-pair">
          <Field label="Went to bed" htmlFor="rf-bed">
            <input id="rf-bed" type="time" className="input input--time" value={f.bed} onChange={(e) => e.target.value && set('bed', e.target.value)} />
          </Field>
          <Field label="Woke up" htmlFor="rf-wake">
            <input id="rf-wake" type="time" className="input input--time" value={f.wake} onChange={(e) => e.target.value && set('wake', e.target.value)} />
          </Field>
        </div>
        <p className="form-note">
          <MoonIcon size={13} /> {formatDateKey(dateKeyInZone(bedtime, tz), 'weekday')} {clock(m.bedClock)} →{' '}
          {formatDateKey(m.dateKey, 'weekday')} {clock(m.wakeClock)}
          {crossesMidnight && <span className="muted"> · crosses midnight</span>}
        </p>

        <div className="summary-strip" aria-live="polite">
          <div>
            <span>In bed</span>
            <strong>{formatDuration(m.timeInBed)}</strong>
          </div>
          <div>
            <span>{m.hasSleepDetail ? 'Asleep (est.)' : 'Asleep'}</span>
            <strong>{formatDuration(m.asleep)}</strong>
          </div>
          <div>
            <span>Efficiency</span>
            <strong>{m.efficiency != null ? `${Math.round(m.efficiency)}%` : '—'}</strong>
          </div>
          <div>
            <span>vs goal</span>
            <strong className={m.goalDiff >= -5 ? 'tone-good' : 'tone-warn'}>{signedMinutes(m.goalDiff)}</strong>
          </div>
        </div>

        <div className="time-pair">
          <Field label="Time to fall asleep" hint="Your best estimate">
            <Stepper label="minutes to fall asleep" value={f.latency} onChange={(x) => set('latency', x)} step={5} max={240} unit="min" allowEmpty />
          </Field>
          <Field label="Awake during night" hint="Total, after falling asleep">
            <Stepper label="minutes awake" value={f.awake} onChange={(x) => set('awake', x)} step={5} max={480} unit="min" allowEmpty />
          </Field>
        </div>
        <Field label="Times woken up">
          <Stepper label="awakenings" value={f.awakenings} onChange={(x) => set('awakenings', x)} max={30} allowEmpty />
        </Field>

        <Field label="How did you sleep?">
          <ScalePicker label="Sleep quality" value={f.quality} onChange={(x) => set('quality', x)} icons={QUALITY_ICONS} labels={QUALITY_LABELS} />
        </Field>

        <Field label="Notes" htmlFor="rf-notes">
          <textarea
            id="rf-notes"
            className="input textarea"
            rows={3}
            placeholder="Dreams, disturbances, anything worth remembering…"
            value={f.notes}
            maxLength={1000}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>

        <div className={cx('disclosure', showStages && 'is-open')}>
          <button type="button" className="disclosure__toggle" onClick={() => setShowStages((x) => !x)} aria-expanded={showStages}>
            <Watch size={16} />
            <span>
              Sleep stages <small>from a wearable or sleep app</small>
            </span>
            <ChevronDown size={16} className="disclosure__chev" />
          </button>
          {showStages && (
            <div className="disclosure__body">
              <p className="form-note">
                Lumen doesn’t measure sleep stages. If your tracker reports them, copy the minutes here. Leave this off
                otherwise — we never estimate stages.
              </p>
              <label className="check">
                <input type="checkbox" checked={f.stagesOn} onChange={(e) => set('stagesOn', e.target.checked)} />
                <span>Include stage data for this night</span>
              </label>
              {f.stagesOn && (
                <>
                  <div className="stage-inputs">
                    {STAGE_ORDER.map((k) => (
                      <Field key={k} label={<span className="stage-label"><i className={`dot stage-${k}`} />{STAGE_LABEL[k]}</span>} htmlFor={`st-${k}`}>
                        <div className="input-unit">
                          <input
                            id={`st-${k}`}
                            className="input"
                            inputMode="numeric"
                            type="number"
                            min={0}
                            max={1200}
                            placeholder={k === 'awake' ? '0' : '—'}
                            value={f.stages[k]}
                            onChange={(e) => set('stages', { ...f.stages, [k]: e.target.value })}
                          />
                          <span>min</span>
                        </div>
                      </Field>
                    ))}
                  </div>
                  <Field label="Device / app (optional)" htmlFor="st-dev">
                    <input
                      id="st-dev"
                      className="input"
                      placeholder="e.g. Oura, Apple Watch"
                      value={f.stages.device}
                      maxLength={40}
                      onChange={(e) => set('stages', { ...f.stages, device: e.target.value })}
                    />
                  </Field>
                  {stagesIncomplete && <p className="form-note tone-warn">Enter REM, light and deep minutes to include stages.</p>}
                  {stages && <p className="form-note">With stages, time asleep = REM + light + deep.</p>}
                </>
              )}
            </div>
          )}
        </div>

        {(v.errors.length > 0 || v.warnings.length > 0) && (
          <div className={cx('alert', v.errors.length ? 'alert--error' : 'alert--warn')} role="alert">
            <AlertTriangle size={16} />
            <div>
              {[...v.errors, ...v.warnings].map((x) => (
                <div key={x}>{x}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
