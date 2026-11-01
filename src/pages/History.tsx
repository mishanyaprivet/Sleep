import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Moon as MoonIcon, Plus, Trophy, TrendingDown } from 'lucide-react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useClock } from '../state/format';
import { Button, Card, CardHeader, EmptyState, IconButton, cx } from '../components/ui';
import type { Night } from '../lib/sleep';
import { primaryNights } from '../lib/sleep';
import {
  addDays,
  formatDateKey,
  formatDuration,
  monthLabel,
  parseDateKey,
  WEEKDAYS,
  weekdayOf,
} from '../lib/time';
import { downloadText, recordsToCsv } from '../data/csv';

export function scoreTier(score: number) {
  if (score >= 85) return 'tier-4';
  if (score >= 70) return 'tier-3';
  if (score >= 55) return 'tier-2';
  return 'tier-1';
}

export function NightRow({ night, onClick }: { night: Night; onClick: () => void }) {
  const { clock } = useClock();
  return (
    <button type="button" className="night-row" onClick={onClick}>
      <span className={cx('night-row__score', scoreTier(night.score.total))}>{night.score.total}</span>
      <span className="night-row__main">
        <span className="night-row__date">
          {formatDateKey(night.dateKey, 'weekday')}, {formatDateKey(night.dateKey)}
          {!night.primary && <em className="tag-nap">nap</em>}
        </span>
        <span className="night-row__times">
          {clock(night.bedClock)} → {clock(night.wakeClock)}
          {night.hasStages && <span className="tag-stage">stages</span>}
        </span>
      </span>
      <span className="night-row__dur">
        <strong>{formatDuration(night.asleep, { short: true })}</strong>
        <small className={night.metGoal ? 'tone-good' : 'tone-warn'}>{night.metGoal ? 'goal met' : 'below goal'}</small>
      </span>
      <ChevronRight size={16} className="muted" />
    </button>
  );
}

export function HistoryPage() {
  const { nights, today, records, journal, settings } = useStore();
  const { openNight, openRecordForm, toast } = useUI();
  const t = parseDateKey(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [selected, setSelected] = useState<string>(today);
  const [limit, setLimit] = useState(20);

  const byDate = useMemo(() => {
    const map = new Map<string, Night[]>();
    for (const n of nights) map.set(n.dateKey, [...(map.get(n.dateKey) ?? []), n]);
    return map;
  }, [nights]);

  const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
  const lead = (weekdayOf(first) + 6) % 7; // Monday-first
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);

  const monthNights = primaryNights(nights).filter((n) => n.dateKey.startsWith(first.slice(0, 7)));
  const monthAvg = monthNights.length ? monthNights.reduce((a, n) => a + n.asleep, 0) / monthNights.length : null;
  const best = monthNights.length ? monthNights.reduce((a, b) => (b.score.total > a.score.total ? b : a)) : null;
  const worst = monthNights.length ? monthNights.reduce((a, b) => (b.score.total < a.score.total ? b : a)) : null;

  const shiftMonth = (d: number) => {
    let m = ym.m + d;
    let y = ym.y;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setYm({ y, m });
  };
  const isCurrentMonth = ym.y === t.y && ym.m === t.m;
  const selNights = byDate.get(selected) ?? [];
  const all = [...nights].reverse();

  const exportCsv = () => {
    if (!records.length) return toast('Nothing to export yet');
    downloadText(`lumen-sleep-${today}.csv`, recordsToCsv(records, journal, settings.goalMin));
    toast(`Exported ${records.length} nights`);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your nights</p>
          <h1 className="page-title">History</h1>
        </div>
        <div className="page-header__actions">
          <Button size="sm" variant="ghost" icon={<Download size={15} />} onClick={exportCsv}>
            Export CSV
          </Button>
          <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => openRecordForm()}>
            Log
          </Button>
        </div>
      </header>

      <div className="grid-2">
        <Card>
          <div className="cal-head">
            <IconButton label="Previous month" onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={18} />
            </IconButton>
            <h2 className="cal-head__title">{monthLabel(ym.y, ym.m)}</h2>
            <IconButton label="Next month" onClick={() => shiftMonth(1)} disabled={isCurrentMonth}>
              <ChevronRight size={18} />
            </IconButton>
          </div>
          <div className="calendar" role="grid" aria-label={`Sleep calendar, ${monthLabel(ym.y, ym.m)}`}>
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <div key={wd} className="calendar__wd" role="columnheader">
                {WEEKDAYS[wd].slice(0, 2)}
              </div>
            ))}
            {cells.map((k, i) => {
              if (!k) return <div key={`e${i}`} className="calendar__cell is-empty" />;
              const ns = byDate.get(k);
              const p = ns?.find((n) => n.primary);
              const future = k > today;
              return (
                <button
                  key={k}
                  type="button"
                  role="gridcell"
                  disabled={future}
                  aria-selected={selected === k}
                  aria-label={`${formatDateKey(k, 'long')}${p ? `, ${formatDuration(p.asleep)}, score ${p.score.total}` : ', no data'}`}
                  className={cx(
                    'calendar__cell',
                    p && scoreTier(p.score.total),
                    k === today && 'is-today',
                    selected === k && 'is-selected',
                    future && 'is-future',
                  )}
                  onClick={() => setSelected(k)}
                >
                  <span className="calendar__day">{Number(k.slice(8))}</span>
                  {p && <span className="calendar__dur">{(p.asleep / 60).toFixed(1)}</span>}
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span><i className="tier-4" />85+</span>
            <span><i className="tier-3" />70–84</span>
            <span><i className="tier-2" />55–69</span>
            <span><i className="tier-1" />&lt;55</span>
            <span className="muted">Number = hours asleep</span>
          </div>
          <div className="month-summary">
            <div>
              <span>Nights logged</span>
              <strong>{monthNights.length}</strong>
            </div>
            <div>
              <span>Avg asleep</span>
              <strong>{formatDuration(monthAvg, { short: true })}</strong>
            </div>
            <div>
              <span>Goal met</span>
              <strong>{monthNights.filter((n) => n.metGoal).length}</strong>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={formatDateKey(selected, 'long')} subtitle="Night ending on this morning" />
          {selNights.length ? (
            <div className="list">
              {selNights.map((n) => (
                <NightRow key={n.record.id} night={n} onClick={() => openNight(n.record.id)} />
              ))}
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={14} />}
                onClick={() => openRecordForm({ date: selected })}
              >
                Add another sleep (nap)
              </Button>
            </div>
          ) : (
            <EmptyState
              icon={<MoonIcon size={22} />}
              title={selected > today ? 'In the future' : 'No sleep logged'}
              body={selected <= today ? 'Add the bedtime and wake-up time for this night.' : undefined}
              action={
                selected <= today ? (
                  <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openRecordForm({ date: selected })}>
                    Log this night
                  </Button>
                ) : undefined
              }
            />
          )}
          {best && worst && best !== worst && (
            <div className="best-worst">
              <button type="button" onClick={() => openNight(best.record.id)}>
                <Trophy size={15} />
                <span>Best this month</span>
                <strong>
                  {formatDateKey(best.dateKey)} · {best.score.total}
                </strong>
              </button>
              <button type="button" onClick={() => openNight(worst.record.id)}>
                <TrendingDown size={15} />
                <span>Toughest this month</span>
                <strong>
                  {formatDateKey(worst.dateKey)} · {worst.score.total}
                </strong>
              </button>
            </div>
          )}
        </Card>

        <Card className="span-2">
          <CardHeader title="All nights" subtitle={`${nights.length} ${nights.length === 1 ? 'record' : 'records'}`} />
          {all.length ? (
            <div className="list">
              {all.slice(0, limit).map((n) => (
                <NightRow key={n.record.id} night={n} onClick={() => openNight(n.record.id)} />
              ))}
              {all.length > limit && (
                <Button variant="ghost" block onClick={() => setLimit((l) => l + 30)}>
                  Show more
                </Button>
              )}
            </div>
          ) : (
            <EmptyState icon={<MoonIcon size={22} />} title="No nights yet" body="Your logged nights will appear here." />
          )}
        </Card>
      </div>
    </div>
  );
}
