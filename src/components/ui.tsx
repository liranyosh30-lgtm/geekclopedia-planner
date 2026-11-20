import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { isOverdue } from '../lib/filters';
import { formatTime } from '../lib/dates';
import { ASSIGNEE_LABEL, FORMAT_LABEL, STATUS_LABEL, type ContentItem, type Status } from '../lib/types';

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status st-${status}`}><span className="dot" aria-hidden="true" />{STATUS_LABEL[status]}</span>;
}

export function OverdueBadge() {
  return <span className="badge overdue" title="התאריך המתוכנן עבר והתוכן לא סומן כפורסם">באיחור</span>;
}

/** כרטיס מקוצר: נושא, פורמט, אחראי, סטטוס */
export function ItemCard({ item, onOpen, compact = false, draggable = false, extra }: {
  item: ContentItem; onOpen: (id: string) => void; compact?: boolean; draggable?: boolean; extra?: ReactNode;
}) {
  const overdue = isOverdue(item);
  return (
    <article className={`card st-border-${item.status} ${overdue ? 'is-overdue' : ''} ${compact ? 'compact' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-item-id', item.id);
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).classList.add('dragging');
      }}
      onDragEnd={(e) => (e.currentTarget as HTMLElement).classList.remove('dragging')}
      data-item-id={item.id}>
      <button className="card-main" onClick={() => onOpen(item.id)}
        aria-label={`${item.title} · ${STATUS_LABEL[item.status]}${overdue ? ' · באיחור' : ''}`}>
        <span className="card-title" dir="auto">
          {item.planned_time && <span className="card-time">{formatTime(item.planned_time)} </span>}
          {item.title}
        </span>
        <span className="card-meta">
          <StatusBadge status={item.status} />
          {item.format && <span className="tag">{FORMAT_LABEL[item.format]}</span>}
          {item.assignee && <span className={`tag who who-${item.assignee}`}>{ASSIGNEE_LABEL[item.assignee]}</span>}
          {overdue && <OverdueBadge />}
          {!compact && item.series && <span className="tag series" dir="auto">{item.series}</span>}
        </span>
      </button>
      {extra}
    </article>
  );
}

export function Dialog({ title, onClose, children, wide = false, labelledBy }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, select, summary, [tabindex]:not([tabindex="-1"])'))
          .filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    el?.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      el?.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true"
        aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : title}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger = false, busy = false, error, onConfirm, onCancel }: {
  title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; error?: string | null;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="dialog-body">
        <h2>{title}</h2>
        <div className="confirm-body">{body}</div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="row gap end">
          <button className="btn" onClick={onCancel} autoFocus>ביטול</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'מבצע…' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
