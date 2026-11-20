import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../lib/store';
import { formatDateHe } from '../lib/dates';
import { ASSIGNEES, FORMATS, type Assignee, type Format } from '../lib/types';
import { Dialog } from './ui';

export interface NewItemPreset { planned_date?: string }

const DRAFT_KEY = 'gp:new-item-draft';

interface Draft { title: string; planned_date: string; planned_time: string; format: '' | Format; assignee: '' | Assignee; series: string }

export default function NewItemDialog({ preset, onClose, onCreated }: {
  preset: NewItemPreset; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { createItem, items } = useStore();
  const [d, setD] = useState<Draft>(() => {
    let saved: Partial<Draft> = {};
    try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { /* אין טיוטה */ }
    return {
      title: saved.title ?? '', planned_time: saved.planned_time ?? '', format: saved.format ?? '',
      assignee: saved.assignee ?? '', series: saved.series ?? '',
      planned_date: preset.planned_date ?? saved.planned_date ?? '',
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seriesOptions = useMemo(() => [...new Set(items.map((i) => i.series).filter(Boolean) as string[])], [items]);

  // שמירת הטופס במכשיר — אם הרשת נופלת או הדף נסגר, הטקסט לא הולך לאיבוד
  useEffect(() => {
    try {
      if (d.title || d.series) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* אחסון מקומי לא זמין */ }
  }, [d]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!d.title.trim()) { setError('כדי ליצור רעיון צריך רק נושא.'); return; }
    setBusy(true); setError(null);
    const res = await createItem({
      title: d.title.trim(),
      planned_date: d.planned_date || null,
      planned_time: d.planned_date && d.planned_time ? d.planned_time : null,
      format: d.format || null,
      assignee: d.assignee || null,
      series: d.series.trim() || null,
    });
    setBusy(false);
    if (res.error || !res.item) { setError(res.error ?? 'היצירה נכשלה.'); return; }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ }
    onCreated(res.item.id);
  };

  return (
    <Dialog title="תוכן חדש" onClose={onClose} labelledBy="new-title">
      <form className="dialog-body" onSubmit={submit} noValidate>
        <h2 id="new-title">{d.planned_date ? `תוכן חדש · ${formatDateHe(d.planned_date)}` : 'רעיון חדש לבנק הרעיונות'}</h2>
        <label className="field">
          <span>נושא או שם עבודה <span className="req">*</span></span>
          <input dir="auto" value={d.title} maxLength={300} autoFocus required
            onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="למשל: 10 עובדות על הטארדיס" />
        </label>
        <p className="muted small">רק הנושא חובה. את כל השאר אפשר להשלים בהמשך.</p>
        <div className="grid2">
          <label className="field"><span>תאריך מתוכנן</span>
            <input type="date" value={d.planned_date} onChange={(e) => setD({ ...d, planned_date: e.target.value })} />
          </label>
          <label className="field"><span>שעה (לא חובה)</span>
            <input type="time" value={d.planned_time} disabled={!d.planned_date} onChange={(e) => setD({ ...d, planned_time: e.target.value })} />
          </label>
          <label className="field"><span>פורמט</span>
            <select value={d.format} onChange={(e) => setD({ ...d, format: e.target.value as Draft['format'] })}>
              <option value="">טרם נקבע</option>
              {FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label className="field"><span>אחראי</span>
            <select value={d.assignee} onChange={(e) => setD({ ...d, assignee: e.target.value as Draft['assignee'] })}>
              <option value="">טרם נקבע</option>
              {ASSIGNEES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span>סדרת תוכן</span>
          <input dir="auto" list="series-options-new" value={d.series} maxLength={120} onChange={(e) => setD({ ...d, series: e.target.value })} />
          <datalist id="series-options-new">{seriesOptions.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        {d.planned_date && <button type="button" className="linkbtn" onClick={() => setD({ ...d, planned_date: '', planned_time: '' })}>בלי תאריך — לבנק הרעיונות</button>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="row gap end">
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'יוצר…' : error ? 'ניסיון חוזר' : 'יצירה ופתיחת הכרטיס'}</button>
        </div>
      </form>
    </Dialog>
  );
}
