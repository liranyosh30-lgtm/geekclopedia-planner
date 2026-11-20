import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { matchesFilters, type Filters } from '../lib/filters';
import { formatDateHe, todayISO } from '../lib/dates';
import type { ContentItem } from '../lib/types';
import { EmptyState, ItemCard } from './ui';
import { MonthNav, sortByTime } from './CalendarView';
import type { NewItemPreset } from './NewItemDialog';

/** תצוגת רשימה — נוחה לנייד: כל הימים בחודש שיש בהם תוכן, לפי סדר */
export default function ListView({ month, filters, onMonth, onOpen, onNew }: {
  month: string; filters: Filters; onMonth: (m: string) => void; onOpen: (id: string) => void;
  onNew: (p: NewItemPreset) => void;
}) {
  const { items } = useStore();
  const today = todayISO();
  const groups = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const it of items) {
      if (!it.planned_date?.startsWith(month) || it.archived_at || !matchesFilters(it, filters)) continue;
      const l = map.get(it.planned_date) ?? [];
      l.push(it);
      map.set(it.planned_date, l);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, l]) => [d, l.sort(sortByTime)] as const);
  }, [items, filters, month]);

  return (
    <section aria-label="רשימת תכנים">
      <MonthNav month={month} onMonth={onMonth} />
      {groups.length === 0 ? (
        <EmptyState title="אין תכנים משובצים בחודש הזה">
          <p className="muted">אפשר ליצור תוכן חדש או לשבץ רעיון מבנק הרעיונות.</p>
          <button className="btn primary" onClick={() => onNew({ planned_date: month === today.slice(0, 7) ? today : `${month}-01` })}>תוכן חדש בחודש הזה</button>
        </EmptyState>
      ) : (
        <ol className="daylist">
          {groups.map(([date, list]) => (
            <li key={date} className={`daygroup ${date === today ? 'today' : ''}`}>
              <div className="daygroup-head">
                <h2>{formatDateHe(date)}{date === today && <span className="today-pill">היום</span>}</h2>
                <button className="btn subtle small" onClick={() => onNew({ planned_date: date })} aria-label={`תוכן חדש ב${formatDateHe(date)}`}>＋ הוספה</button>
              </div>
              <div className="stack">
                {list.map((it) => <ItemCard key={it.id} item={it} onOpen={onOpen} />)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
