import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Coffee,
  Dumbbell,
  Moon as MoonIcon,
  Save,
  Sun,
  Sparkles,
  Trash2,
  Wine,
  Utensils,
  Smartphone,
  BedSingle,
  Flower2,
  Plane,
  Thermometer,
  BookOpenText,
} from 'lucide-react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { Button, Card, CardHeader, EmptyState, Field, ScalePicker, Stepper, Toggle, cx } from '../components/ui';
import {
  ENERGY_ICONS,
  ENERGY_LABELS,
  MOOD_ICONS,
  MOOD_LABELS,
  RESTED_ICONS,
  RESTED_LABELS,
  STRESS_ICONS,
  STRESS_LABELS,
} from '../components/icons';
import type { JournalEntry, JournalTag } from '../data/types';
import { habitPatterns, MIN_PATTERN_SAMPLES, primaryNights, restedVsSleep } from '../lib/sleep';
import { addDays, formatDateKey, formatDuration, relativeDayLabel, signedMinutes } from '../lib/time';

const TAGS: { key: JournalTag; label: string; icon: React.ReactNode }[] = [
  { key: 'alcohol', label: 'Alcohol', icon: <Wine size={14} /> },
  { key: 'lateMeal', label: 'Late meal', icon: <Utensils size={14} /> },
  { key: 'screens', label: 'Screens in bed', icon: <Smartphone size={14} /> },
  { key: 'nap', label: 'Nap', icon: <BedSingle size={14} /> },
  { key: 'meditation', label: 'Meditation', icon: <Flower2 size={14} /> },
  { key: 'reading', label: 'Reading', icon: <BookOpenText size={14} /> },
  { key: 'travel', label: 'Travel', icon: <Plane size={14} /> },
  { key: 'sick', label: 'Unwell', icon: <Thermometer size={14} /> },
];

type Draft = Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft = (date: string): Draft => ({
  date,
  mood: null,
  energy: null,
  rested: null,
  caffeine: null,
  lastCaffeine: null,
  exercise: null,
  exerciseMin: null,
  stress: null,
  tags: [],
  notes: '',
});

function toDraft(e: JournalEntry | undefined, date: string): Draft {
  if (!e) return emptyDraft(date);
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = e;
  return { ...emptyDraft(date), ...rest };
}

export function JournalPage() {
  const { journal, nights, today, saveJournal, deleteJournal } = useStore();
  const { journalDate, openJournal, toast, confirm, openNight } = useUI();
  const [date, setDate] = useState(journalDate ?? today);
  const existing = journal.find((e) => e.date === date);
  const [d, setD] = useState<Draft>(() => toDraft(existing, date));

  useEffect(() => {
    if (journalDate) {
      setDate(journalDate);
      openJournal(null);
    }
  }, [journalDate, openJournal]);

  useEffect(() => {
    setD(toDraft(journal.find((e) => e.date === date), date));
  }, [date, journal]);

  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('.is-active');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [date]);

  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(existing, date));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggleTag = (t: JournalTag) => set('tags', d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t]);

  const prim = useMemo(() => primaryNights(nights), [nights]);
  const lastNight = prim.find((n) => n.dateKey === date);
  const tonight = prim.find((n) => n.dateKey === addDays(date, 1));
  const patterns = useMemo(() => habitPatterns(nights, journal), [nights, journal]);
  const rested = useMemo(() => restedVsSleep(nights, journal), [nights, journal]);
  const strip = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).reverse();
  const recent = [...journal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  const save = async () => {
    try {
      await saveJournal({ ...d, notes: d.notes?.trim() || '' });
      toast('Journal saved');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const remove = async () => {
    if (!existing) return;
    if (await confirm({ title: 'Delete this entry?', body: formatDateKey(date, 'long'), confirmLabel: 'Delete', danger: true })) {
      await deleteJournal(existing.id);
      toast('Entry deleted');
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Mood, energy & habits</p>
          <h1 className="page-title">Journal</h1>
        </div>
      </header>

      <div className="date-strip" role="tablist" aria-label="Choose a day" ref={stripRef}>
        {strip.map((k) => {
          const has = journal.some((e) => e.date === k);
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === date}
              className={cx('date-strip__item', k === date && 'is-active')}
              onClick={() => setDate(k)}
            >
              <span>{formatDateKey(k, 'weekday').slice(0, 2)}</span>
              <strong>{Number(k.slice(8))}</strong>
              <i className={cx('date-strip__dot', has && 'on')} />
            </button>
          );
        })}
        <input
          type="date"
          className="input input--compact"
          aria-label="Pick another date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>

      <div className="grid-2">
        <Card>
          <CardHeader
            title={relativeDayLabel(date, today)}
            subtitle={formatDateKey(date, 'long')}
            icon={<Sun size={16} />}
            action={
              existing ? (
                <Button size="sm" variant="ghost" className="btn--danger-text" icon={<Trash2 size={14} />} onClick={remove}>
                  Delete
                </Button>
              ) : undefined
            }
          />
          <h3 className="subhead">
            Morning check-in <small>· about the night that ended this morning</small>
          </h3>
          {lastNight ? (
            <button type="button" className="linked-night" onClick={() => openNight(lastNight.record.id)}>
              <MoonIcon size={14} /> {formatDuration(lastNight.asleep)} asleep · score {lastNight.score.total}
            </button>
          ) : (
            <p className="muted small">No sleep logged for this night.</p>
          )}
          <div className="stack">
            <Field label="Mood on waking">
              <ScalePicker label="Mood" value={d.mood} onChange={(v) => set('mood', v)} icons={MOOD_ICONS} labels={MOOD_LABELS} />
            </Field>
            <Field label="Energy">
              <ScalePicker label="Energy" value={d.energy} onChange={(v) => set('energy', v)} icons={ENERGY_ICONS} labels={ENERGY_LABELS} />
            </Field>
            <Field label="How rested do you feel?">
              <ScalePicker label="Rested" value={d.rested} onChange={(v) => set('rested', v)} icons={RESTED_ICONS} labels={RESTED_LABELS} />
            </Field>
          </div>

          <h3 className="subhead subhead--spaced">
            Daytime habits <small>· linked to the night after</small>
          </h3>
          {tonight && (
            <button type="button" className="linked-night" onClick={() => openNight(tonight.record.id)}>
              <MoonIcon size={14} /> Following night: {formatDuration(tonight.asleep)} · score {tonight.score.total}
            </button>
          )}
          <div className="stack">
            <div className="time-pair">
              <Field label={<><Coffee size={14} /> Caffeine</>} hint="Cups of coffee, tea, energy drinks">
                <Stepper label="caffeinated drinks" value={d.caffeine ?? null} onChange={(v) => set('caffeine', v)} max={15} unit="cups" allowEmpty />
              </Field>
              {(d.caffeine ?? 0) > 0 && (
                <Field label="Last caffeine at" htmlFor="j-lc">
                  <input
                    id="j-lc"
                    type="time"
                    className="input input--time"
                    value={d.lastCaffeine ?? ''}
                    onChange={(e) => set('lastCaffeine', e.target.value || null)}
                  />
                </Field>
              )}
            </div>
            <div className="exercise">
              <Toggle
                checked={!!d.exercise}
                onChange={(v) => {
                  set('exercise', v);
                  if (!v) set('exerciseMin', null);
                }}
                label={<><Dumbbell size={14} /> Exercise</>}
                description={d.exercise == null ? 'Not recorded' : d.exercise ? 'Yes' : 'No exercise today'}
              />
              {d.exercise && (
                <Stepper label="exercise minutes" value={d.exerciseMin ?? null} onChange={(v) => set('exerciseMin', v)} step={10} max={600} unit="min" allowEmpty />
              )}
            </div>
            <Field label="Stress level">
              <ScalePicker label="Stress" value={d.stress} onChange={(v) => set('stress', v)} icons={STRESS_ICONS} labels={STRESS_LABELS} />
            </Field>
            <Field label="Tags">
              <div className="chips chips--wrap">
                {TAGS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={d.tags.includes(t.key)}
                    className={cx('chip', d.tags.includes(t.key) && 'is-active')}
                    onClick={() => toggleTag(t.key)}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Notes & observations" htmlFor="j-notes">
              <textarea
                id="j-notes"
                className="input textarea"
                rows={3}
                maxLength={2000}
                placeholder="How did the day feel? Anything that might have affected your sleep?"
                value={d.notes ?? ''}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
          </div>
          <div className="form-actions">
            <span className="muted small">{dirty ? 'Unsaved changes' : existing ? 'Saved' : ''}</span>
            <Button variant="primary" icon={<Save size={16} />} onClick={save} disabled={!dirty}>
              Save entry
            </Button>
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader title="Patterns" icon={<Sparkles size={16} />} subtitle="How your habits line up with the following night" />
            {patterns.length ? (
              <ul className="patterns">
                {patterns.map((p) => {
                  const r = Math.round(p.scoreDelta);
                  const pos = r >= 0;
                  return (
                    <li key={p.key} className="pattern">
                      <div className="pattern__top">
                        <span>{p.label}</span>
                        <strong className={r === 0 ? 'tone-muted' : pos ? 'tone-good' : 'tone-warn'}>
                          {r === 0 ? '±0' : `${pos ? '+' : '−'}${Math.abs(r)}`} pts
                        </strong>
                      </div>
                      <div className="pattern__bars">
                        <div>
                          <small>With · {p.withN} nights</small>
                          <span className="pattern__bar"><span style={{ width: `${p.scoreWith}%` }} /></span>
                          <em>{Math.round(p.scoreWith)}</em>
                        </div>
                        <div>
                          <small>Without · {p.withoutN}</small>
                          <span className="pattern__bar pattern__bar--muted"><span style={{ width: `${p.scoreWithout}%` }} /></span>
                          <em>{Math.round(p.scoreWithout)}</em>
                        </div>
                      </div>
                      <small className="muted">Time asleep {signedMinutes(p.asleepDelta)} on average</small>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={<Sparkles size={22} />}
                title="Patterns appear over time"
                body={`Each comparison needs at least ${MIN_PATTERN_SAMPLES} nights with and ${MIN_PATTERN_SAMPLES} without a habit, plus a logged night after each entry.`}
              />
            )}
            {rested && (
              <p className="pattern-note">
                On mornings after meeting your goal you rated feeling rested <strong>{rested.restedMet.toFixed(1)}/5</strong>, vs{' '}
                <strong>{rested.restedMissed.toFixed(1)}/5</strong> after shorter nights ({rested.nMet} vs {rested.nMissed} mornings).
              </p>
            )}
            <p className="disclaimer">
              These are associations in your own data, not proof that a habit causes better or worse sleep. Small samples can
              be misleading.
            </p>
          </Card>

          <Card>
            <CardHeader title="Recent entries" icon={<BookOpen size={16} />} />
            {recent.length ? (
              <ul className="entries">
                {recent.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="entry" onClick={() => setDate(e.date)}>
                      <span className="entry__date">
                        <strong>{formatDateKey(e.date, 'weekday')}</strong>
                        <small>{formatDateKey(e.date)}</small>
                      </span>
                      <span className="entry__icons">
                        {e.mood != null && <span title={`Mood: ${MOOD_LABELS[e.mood - 1]}`}>{MOOD_ICONS[e.mood - 1]}</span>}
                        {e.energy != null && <span title={`Energy: ${ENERGY_LABELS[e.energy - 1]}`}>{ENERGY_ICONS[e.energy - 1]}</span>}
                        {(e.caffeine ?? 0) > 0 && <span title={`${e.caffeine} caffeinated drinks`}><Coffee size={18} /></span>}
                        {e.exercise && <span title="Exercised"><Dumbbell size={18} /></span>}
                      </span>
                      <span className="entry__notes">{e.notes || e.tags.map((t) => TAGS.find((x) => x.key === t)?.label).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No entries yet" body="A quick check-in each morning helps reveal what works for you." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
