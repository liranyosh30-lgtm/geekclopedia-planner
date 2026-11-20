import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { itemSearchText, matchesFilters, type Filters } from '../lib/filters';
import { formatDateHe, todayISO } from '../lib/dates';
import type { ContentItem } from '../lib/types';
import { EmptyState, ItemCard } from './ui';
import type { NewItemPreset } from './NewItemDialog';

export default function IdeaBank({ filters, onOpen, onNew }: {
  filters: Filters; onOpen: (id: string) => void; onNew: (p: NewItemPreset) => void;
}) {
  const { items } = useStore();
  const [q, setQ] = useState('');
  const [series, setSeries] = useState('');

  const ideas = useMemo(() => items.filter((i) => !i.planned_date && !i.archived_at), [items]);
  const seriesList = useMemo(() => [...new Set(ideas.map((i) => i.series).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'he')), [ideas]);
  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return ideas
      .filter((i) => matchesFilters(i, filters))
      .filter((i) => !series || i.series === series)
      .filter((i) => { if (!terms.length) return true; const t = itemSearchText(i); return terms.every((w) => t.includes(w)); })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [ideas, filters, q, series]);

  return (
    <section aria-label="בנק רעיונות">
      <div className="section-head">
        <h1>בנק רעיונות <span className="count">{ideas.length}</span></h1>
        <button className="btn primary" onClick={() => onNew({})}>＋ רעיון חדש</button>
      </div>
      <p className="muted">רעיונות ותכנים שעדיין לא שובצו לתאריך. שיבוץ ללוח והחזרה לבנק שומרים את כל התוכן, הקבצים וההערות.</p>
      <div className="searchbar">
        <label className="field grow">
          <span className="sr-only">חיפוש</span>
          <input type="search" dir="auto" placeholder="חיפוש לפי נושא, בריף, קופי, שקפים…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {seriesList.length > 0 && (
          <label className="filter">
            <span>סדרה</span>
            <select value={series} onChange={(e) => setSeries(e.target.value)}>
              <option value="">כל הסדרות</option>
              {seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
      {shown.length === 0 ? (
        <EmptyState title={ideas.length ? 'לא נמצאו רעיונות שתואמים לחיפוש' : 'בנק הרעיונות ריק'}>
          {!ideas.length && <p className="muted">לרעיון חדש מספיק נושא בלבד — את השאר אפשר להשלים בהמשך.</p>}
        </EmptyState>
      ) : (
        <div className="grid-cards">
          {shown.map((it) => <ItemCard key={it.id} item={it} onOpen={onOpen} extra={<ScheduleControl item={it} />} />)}
        </div>
      )}
    </section>
  );
}

function ScheduleControl({ item }: { item: ContentItem }) {
  const { updateItem, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="btn small card-action" onClick={() => setOpen(true)}>שיבוץ לתאריך</button>;
  const save = async () => {
    if (!date) return;
    setBusy(true);
    const res = await updateItem(item.id, item.version, { planned_date: date });
    setBusy(false);
    if (res.ok) { toast(`"${item.title}" שובץ ל${formatDateHe(date, false)}`, 'success'); setOpen(false); }
    else toast(res.conflict ? 'הכרטיס עודכן בינתיים במכשיר אחר. נסו שוב.' : res.error, 'error');
  };
  return (
    <div className="schedule-inline">
      <label className="field"><span className="sr-only">תאריך לשיבוץ</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
      </label>
      <button className="btn primary small" onClick={save} disabled={busy || !date}>{busy ? 'שומר…' : 'שיבוץ'}</button>
      <button className="btn small" onClick={() => setOpen(false)}>ביטול</button>
    </div>
  );
}
