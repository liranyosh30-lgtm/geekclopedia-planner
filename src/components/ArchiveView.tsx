import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { formatDateHe, formatDateTimeHe } from '../lib/dates';
import type { ContentItem } from '../lib/types';
import { ConfirmDialog, EmptyState, StatusBadge } from './ui';

export default function ArchiveView({ onOpen }: { onOpen: (id: string) => void }) {
  const { items, updateItem, deleteItemForever, toast } = useStore();
  const archived = useMemo(() => items.filter((i) => i.archived_at).sort((a, b) => b.archived_at!.localeCompare(a.archived_at!)), [items]);
  const [toDelete, setToDelete] = useState<ContentItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const restore = async (it: ContentItem) => {
    const res = await updateItem(it.id, it.version, { archived_at: null });
    if (res.ok) toast(`"${it.title}" שוחזר ${it.planned_date ? 'ללוח' : 'לבנק הרעיונות'}`, 'success');
    else toast(res.conflict ? 'הכרטיס השתנה במכשיר אחר. נסו שוב.' : res.error, 'error');
  };

  return (
    <section aria-label="ארכיון">
      <div className="section-head"><h1>ארכיון <span className="count">{archived.length}</span></h1></div>
      <p className="muted">תכנים בארכיון לא מופיעים בלוח ובבנק הרעיונות. אפשר לשחזר אותם בכל עת, כולל הקבצים וההערות. מחיקה לצמיתות אפשרית רק מכאן.</p>
      {archived.length === 0 ? <EmptyState title="הארכיון ריק" /> : (
        <ul className="archive-list">
          {archived.map((it) => (
            <li key={it.id} className="archive-row">
              <button className="linkbtn title" dir="auto" onClick={() => onOpen(it.id)}>{it.title}</button>
              <span className="muted small">
                {it.planned_date ? formatDateHe(it.planned_date, false) : 'ללא תאריך'} · הועבר לארכיון {formatDateTimeHe(it.archived_at!)}
              </span>
              <StatusBadge status={it.status} />
              <span className="row gap">
                <button className="btn small" onClick={() => restore(it)}>שחזור</button>
                <button className="btn small danger-outline" onClick={() => { setErr(null); setToDelete(it); }}>מחיקה לצמיתות</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {toDelete && (
        <ConfirmDialog title="למחוק לצמיתות?" danger busy={busy} error={err} confirmLabel="מחיקה לצמיתות"
          body={<p>הכרטיס <strong dir="auto">"{toDelete.title}"</strong> יימחק יחד עם כל הקבצים המצורפים וההערות שלו. <strong>אי אפשר לבטל את הפעולה.</strong> כדי לשמור עותק, הורידו קודם גיבוי.</p>}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            setBusy(true);
            const e = await deleteItemForever(toDelete);
            setBusy(false);
            if (e) setErr(e); else { toast('הכרטיס נמחק לצמיתות', 'success'); setToDelete(null); }
          }} />
      )}
    </section>
  );
}
