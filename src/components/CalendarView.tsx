import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { matchesFilters, type Filters } from '../lib/filters';
import { addMonths, formatDateHe, monthGrid, monthKey, monthTitle, parseMonthKey, toISODate, todayISO, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates';
import type { ContentItem } from '../lib/types';
import { ItemCard } from './ui';
import type { NewItemPreset } from './NewItemDialog';

export function MonthNav({ month, onMonth }: { month: string; onMonth: (m: string) => void }) {
  const d = parseMonthKey(month);
  const current = monthKey(new Date());
  return (
    <div className="monthnav">
      <button className="btn icon" onClick={() => onMonth(monthKey(addMonths(d, -1)))} aria-label="לחודש הקודם">→</button>
      <h1 className="month-title" aria-live="polite">{monthTitle(d)}</h1>
      <button className="btn icon" onClick={() => onMonth(monthKey(addMonths(d, 1)))} aria-label="לחודש הבא">←</button>
      <button className="btn subtle" onClick={() => onMonth(current)} disabled={month === current}>חזרה לחודש הנוכחי</button>
    </div>
  );
}

export function sortByTime(a: ContentItem, b: ContentItem) {
  return (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99') || a.title.localeCompare(b.title, 'he');
}

export default function CalendarView({ month, filters, onMonth, onOpen, onNew }: {
  month: string; filters: Filters; onMonth: (m: string) => void; onOpen: (id: string) => void;
  onNew: (p: NewItemPreset) => void;
}) {
  const { items, updateItem, toast } = useStore();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const monthDate = parseMonthKey(month);
  const days = useMemo(() => monthGrid(monthDate), [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayISO();

  const byDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const it of items) {
      if (!it.planned_date || it.archived_at || !matchesFilters(it, filters)) continue;
      const list = map.get(it.planned_date) ?? [];
      list.push(it);
      map.set(it.planned_date, list);
    }
    for (const l of map.values()) l.sort(sortByTime);
    return map;
  }, [items, filters]);

  const hiddenCount = useMemo(() => items.filter((i) => i.planned_date?.startsWith(month) && !i.archived_at && !matchesFilters(i, filters)).length, [items, filters, month]);

  const moveTo = async (id: string, date: string) => {
    const it = items.find((x) => x.id === id);
    if (!it || it.planned_date === date) return;
    const res = await updateItem(id, it.version, { planned_date: date });
    if (res.ok) toast(`"${it.title}" הועבר ל${formatDateHe(date, false)}`, 'success');
    else if (res.conflict) toast('הכרטיס עודכן בינתיים במכשיר אחר. הלוח רוענן — נסו לגרור שוב.', 'error');
    else toast(res.error, 'error');
  };

  return (
    <section aria-label="לוח חודשי">
      <MonthNav month={month} onMonth={onMonth} />
      {hiddenCount > 0 && <p className="muted small">{hiddenCount} תכנים בחודש הזה מוסתרים בגלל הסינון.</p>}
      <p className="muted small hint-desktop">טיפ: אפשר לגרור כרטיס ליום אחר. במקלדת ובנייד משנים תאריך מתוך הכרטיס.</p>
      <div className="calendar" role="grid" aria-label={monthTitle(monthDate)}>
        <div className="cal-row cal-head" role="row">
          {WEEKDAYS.map((w, i) => (
            <div key={w} role="columnheader" className="cal-headcell">
              <span className="wd-long">{w}</span><span className="wd-short" aria-hidden="true">{WEEKDAYS_SHORT[i]}</span>
            </div>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, w) => (
          <div className="cal-row" role="row" key={w}>
            {days.slice(w * 7, w * 7 + 7).map((d) => {
              const iso = toISODate(d);
              const inMonth = d.getMonth() === monthDate.getMonth();
              const list = byDate.get(iso) ?? [];
              return (
                <div key={iso} role="gridcell"
                  className={`cal-cell ${inMonth ? '' : 'out'} ${iso === today ? 'today' : ''} ${dropTarget === iso ? 'drop' : ''}`}
                  aria-label={formatDateHe(iso)}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-item-id')) { e.preventDefault(); setDropTarget(iso); } }}
                  onDragLeave={() => setDropTarget((t) => (t === iso ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault(); setDropTarget(null);
                    const id = e.dataTransfer.getData('text/x-item-id');
                    if (id) void moveTo(id, iso);
                  }}>
                  <div className="cal-daybar">
                    <span className="daynum">{d.getDate()}{iso === today && <span className="sr-only"> (היום)</span>}</span>
                    <button className="addday" onClick={() => onNew({ planned_date: iso })}
                      aria-label={`תוכן חדש ב${formatDateHe(iso)}`} title="תוכן חדש ביום הזה">＋</button>
                  </div>
                  <div className="cal-items">
                    {list.map((it) => <ItemCard key={it.id} item={it} onOpen={onOpen} compact draggable />)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
