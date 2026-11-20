import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { isOverdue } from '../lib/filters';
import { formatClock, formatDateHe, formatDateTimeHe } from '../lib/dates';
import {
  ASSIGNEES, EDITABLE_FIELDS, FIELD_LABEL, FORMATS, STATUSES,
  type ContentItem, type EditableField, type EditableValues, type Slide, type SourceLink,
} from '../lib/types';
import { ConfirmDialog, Dialog, OverdueBadge, StatusBadge } from './ui';
import Comments from './Comments';
import Attachments from './Attachments';

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
type Conflicts = Partial<Record<EditableField, unknown>>;

// השוואה עמוקה שלא תלויה בסדר המפתחות (Postgres מחזיר jsonb בסדר מפתחות משלו)
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
      : v ?? null;
const eq = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const pick = (it: ContentItem): EditableValues =>
  Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, it[f]])) as EditableValues;
const draftKey = (id: string) => `gp:draft:${id}`;
const NULLABLE = new Set<EditableField>(['series', 'format', 'assignee', 'planned_date', 'planned_time', 'instagram_url', 'published_on']);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

interface StoredDraft { baseVersion: number; values: Partial<EditableValues>; at: number }

export default function Editor({ id, onClose }: { id: string; onClose: () => void }) {
  const store = useStore();
  const storeItem = store.items.find((x) => x.id === id) ?? null;

  const [base, setBase] = useState<ContentItem | null>(null);
  const [draft, setDraft] = useState<EditableValues | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [remote, setRemote] = useState<ContentItem | null>(null);
  const [conflicts, setConflicts] = useState<Conflicts>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; run: () => void | Promise<void> }>(null);
  const [closing, setClosing] = useState(false);

  const savingRef = useRef(false);
  const ownVersions = useRef(new Set<number>());

  // ---------- טעינה ראשונית + שחזור טיוטה מקומית ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let it = storeItem;
      if (!it) {
        try { it = await store.fetchItem(id); } catch (e) { if (!cancelled) setNotFound('לא ניתן לטעון את הכרטיס. בדקו את החיבור ונסו שוב.'); return; }
      }
      if (cancelled) return;
      if (!it) { setNotFound('הכרטיס לא נמצא. ייתכן שנמחק.'); return; }
      const values = pick(it);
      let stored: StoredDraft | null = null;
      try { stored = JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { /* */ }
      const restoredConflicts: Conflicts = {};
      if (stored && stored.values) {
        for (const f of Object.keys(stored.values) as EditableField[]) {
          if (!EDITABLE_FIELDS.includes(f)) continue;
          const mine = stored.values[f];
          if (eq(mine, values[f])) continue;
          if (stored.baseVersion === it.version) (values as Record<string, unknown>)[f] = mine;
          else restoredConflicts[f] = mine;
        }
        const changed = Object.keys(stored.values).filter((f) => !eq(stored!.values[f as EditableField], it![f as EditableField])).length;
        if (changed) {
          setNotice(stored.baseVersion === it.version
            ? 'שוחזרו שינויים שלא נשמרו בפעם הקודמת. הם נשמרים עכשיו לשרת.'
            : 'נמצא טקסט שלא נשמר בפעם הקודמת, אבל הכרטיס עודכן מאז. הטקסט שלך מוצג ליד כל שדה — בחרו מה לשמור.');
        }
      }
      setBase(it);
      setDraft(values);
      setConflicts(restoredConflicts);
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo<EditableField[]>(
    () => (base && draft ? EDITABLE_FIELDS.filter((f) => !eq(draft[f], base[f])) : []),
    [base, draft],
  );

  // ---------- שמירת טיוטה במכשיר כל עוד יש שינויים שלא אושרו ע"י השרת ----------
  useEffect(() => {
    if (!base || !draft) return;
    try {
      const hasConflicts = Object.keys(conflicts).length > 0;
      if (dirty.length || hasConflicts) {
        const values: Partial<EditableValues> = {};
        for (const f of dirty) (values as Record<string, unknown>)[f] = draft[f];
        for (const f of Object.keys(conflicts) as EditableField[]) (values as Record<string, unknown>)[f] = conflicts[f];
        const sd: StoredDraft = { baseVersion: hasConflicts ? -1 : base.version, values, at: Date.now() };
        localStorage.setItem(draftKey(id), JSON.stringify(sd));
      } else {
        localStorage.removeItem(draftKey(id));
      }
    } catch { /* אחסון מקומי לא זמין — השמירה לשרת עדיין עובדת */ }
  }, [draft, base, dirty, conflicts, id]);

  // ---------- זיהוי עדכון ממכשיר אחר ----------
  useEffect(() => {
    if (!storeItem || !base || savingRef.current) return;
    if (storeItem.version <= base.version || ownVersions.current.has(storeItem.version)) return;
    const who = store.memberName(storeItem.updated_by) || 'משתמש אחר';
    if (dirty.length === 0) {
      setBase(storeItem);
      setDraft(pick(storeItem));
      setNotice(`${who} עדכן/ה את הכרטיס ב-${formatClock(storeItem.updated_at)}. מוצגת הגרסה העדכנית.`);
    } else {
      setRemote(storeItem);
      setSaveState('conflict');
    }
  }, [storeItem, base, dirty.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- שמירה לשרת ----------
  const save = useCallback(async (extra?: Partial<ContentItem>) => {
    if (!base || !draft || savingRef.current) return false;
    const patch: Record<string, unknown> = {};
    for (const f of EDITABLE_FIELDS) if (!eq(draft[f], base[f])) patch[f] = draft[f];
    if (extra) Object.assign(patch, extra);
    if (!Object.keys(patch).length) return true;
    if (!draft.title.trim()) { setSaveState('error'); setSaveError('הנושא לא יכול להיות ריק — השינויים לא נשמרו.'); return false; }
    savingRef.current = true;
    setSaveState('saving'); setSaveError(null);
    const res = await store.updateItem(base.id, base.version, patch);
    savingRef.current = false;
    if (res.ok) {
      ownVersions.current.add(res.item.version);
      setBase(res.item);
      setSaveState('saved'); setSavedAt(Date.now());
      return true;
    }
    if (res.conflict) {
      if (!res.latest) { setSaveState('error'); setSaveError('הכרטיס נמחק במכשיר אחר. הטקסט שלך עדיין שמור במכשיר הזה.'); return false; }
      setRemote(res.latest); setSaveState('conflict');
      return false;
    }
    setSaveState('error'); setSaveError(res.error);
    return false;
  }, [base, draft, store]);

  // שמירה אוטומטית אחרי הפסקה קצרה בהקלדה (הטיימר תלוי רק בטקסט, לא ברענוני רקע)
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty.length || saveState === 'conflict' || saveState === 'saving') return;
    if (saveState === 'error' && !navigator.onLine) return;
    const t = setTimeout(() => { void saveRef.current(); }, saveState === 'error' ? 8000 : 900);
    return () => clearTimeout(t);
  }, [draft, dirty.length, saveState]);

  useEffect(() => {
    const on = () => { if (dirty.length && saveState === 'error') void save(); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [dirty.length, saveState, save]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty.length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty.length]);

  // ---------- פתרון עריכה מקבילה בלי לאבד טקסט ----------
  const resolveConflict = () => {
    if (!remote || !base || !draft) return;
    const next = pick(remote);
    const newConflicts: Conflicts = { ...conflicts };
    for (const f of dirty) {
      const mine = draft[f];
      if (eq(remote[f], base[f]) || eq(remote[f], mine)) {
        (next as Record<string, unknown>)[f] = mine; // השדה לא שונה במכשיר השני — שומרים את שלי
      } else {
        newConflicts[f] = mine; // שני הצדדים שינו — מציגים את הגרסה שלי ליד השדה
      }
    }
    ownVersions.current.add(remote.version);
    setBase(remote); setDraft(next); setConflicts(newConflicts);
    setRemote(null); setSaveState('idle');
    setNotice(Object.keys(newConflicts).length
      ? 'הכרטיס רוענן. בשדות ששניכם שיניתם מוצגת הגרסה שלך — בחרו אם להחזיר אותה.'
      : 'הכרטיס רוענן והשינויים שלך שולבו בו. שומר…');
  };

  const set = <K extends EditableField>(f: K, v: EditableValues[K]) => {
    const value = (NULLABLE.has(f) && v === '' ? null : v) as EditableValues[K];
    setDraft((d) => {
      if (!d) return d;
      const n = { ...d, [f]: value };
      if (f === 'planned_date' && !value) n.planned_time = null;
      return n;
    });
    if (saveState === 'saved') setSaveState('idle');
  };

  const restoreMine = (f: EditableField) => {
    const v = conflicts[f];
    setDraft((d) => (d ? { ...d, [f]: v } : d));
    setConflicts((c) => { const n = { ...c }; delete n[f]; return n; });
  };
  const dropMine = (f: EditableField) => setConflicts((c) => { const n = { ...c }; delete n[f]; return n; });

  const requestClose = async () => {
    if (dirty.length && saveState !== 'conflict') {
      setClosing(true);
      const ok = await save();
      setClosing(false);
      if (ok) { onClose(); return; }
    }
    if (dirty.length || Object.keys(conflicts).length) {
      setConfirm({
        title: 'יש שינויים שלא נשמרו לשרת',
        body: 'השינויים נשמרו במכשיר הזה בלבד ויוצגו שוב כשתפתחו את הכרטיס. לסגור בכל זאת?',
        label: 'סגירה', run: onClose,
      });
      return;
    }
    onClose();
  };

  const archive = async () => {
    const ok = await save({ archived_at: new Date().toISOString() });
    if (ok) { store.toast('הכרטיס הועבר לארכיון. אפשר לשחזר אותו ממסך הארכיון.', 'success'); onClose(); }
  };
  const unarchive = async () => { if (await save({ archived_at: null })) store.toast('הכרטיס שוחזר מהארכיון', 'success'); };

  if (notFound) {
    return (
      <Dialog title="כרטיס" onClose={onClose}>
        <div className="dialog-body"><p role="alert">{notFound}</p><button className="btn" onClick={onClose}>סגירה</button></div>
      </Dialog>
    );
  }
  if (!base || !draft) {
    return <Dialog title="טוען" onClose={onClose}><div className="dialog-body"><p className="muted">טוען את הכרטיס…</p></div></Dialog>;
  }

  const seriesOptions = [...new Set(store.items.map((i) => i.series).filter(Boolean) as string[])];
  const overdue = isOverdue({ ...base, ...draft });
  const remoteWho = remote ? store.memberName(remote.updated_by) || 'משתמש אחר' : '';

  const conflictBox = (f: EditableField) => conflicts[f] !== undefined && (
    <div className="mine-box" role="note">
      <p className="small"><strong>הגרסה שלך ל{FIELD_LABEL[f]}</strong> (לא נשמרה, כי גם במכשיר השני שינו את השדה):</p>
      <pre dir="auto">{typeof conflicts[f] === 'string' ? (conflicts[f] as string) || '(ריק)' : f === 'slides'
        ? (conflicts[f] as Slide[]).map((s, i) => `${i + 1}. ${s.title}\n${s.text}${s.caption ? `\nקאפשן: ${s.caption}` : ''}`).join('\n\n')
        : JSON.stringify(conflicts[f])}</pre>
      <div className="row gap">
        <button className="btn small primary" onClick={() => restoreMine(f)}>להחזיר את הגרסה שלי</button>
        {typeof conflicts[f] === 'string' && (
          <button className="btn small" onClick={() => void navigator.clipboard?.writeText(conflicts[f] as string).then(() => store.toast('הועתק', 'success'))}>העתקה</button>
        )}
        <button className="btn small" onClick={() => dropMine(f)}>להשאיר את הגרסה העדכנית</button>
      </div>
    </div>
  );

  return (
    <Dialog title={`עריכת ${draft.title}`} onClose={() => void requestClose()} wide labelledBy="editor-title">
      <div className="editor">
        <header className="editor-head">
          <div className="editor-head-main">
            <StatusBadge status={draft.status} />
            {overdue && <OverdueBadge />}
            <SaveIndicator state={saveState} dirty={dirty.length > 0} savedAt={savedAt} error={saveError} onRetry={() => void save()} />
          </div>
          <button className="btn" onClick={() => void requestClose()} disabled={closing}>{closing ? 'שומר…' : 'סגירה'}</button>
        </header>

        {saveState === 'conflict' && remote && (
          <div className="banner conflict" role="alert">
            <p><strong>{remoteWho} שינה/תה את הכרטיס בזמן שערכת</strong> ({formatDateTimeHe(remote.updated_at)}). השינויים שלך עוד לא נשמרו — וגם לא יימחקו.</p>
            <button className="btn primary" onClick={resolveConflict}>רענון הכרטיס — בלי לאבד את מה שכתבתי</button>
          </div>
        )}
        {notice && saveState !== 'conflict' && (
          <div className="banner info" role="status">{notice} <button className="linkbtn" onClick={() => setNotice(null)}>הסתרה</button></div>
        )}
        {base.archived_at && (
          <div className="banner warn" role="status">הכרטיס בארכיון ואינו מופיע בלוח. <button className="btn small" onClick={() => void unarchive()}>שחזור מהארכיון</button></div>
        )}
        {overdue && <div className="banner overdue-banner" role="status">התאריך המתוכנן ({formatDateHe(draft.planned_date)}) עבר והתוכן עדיין לא סומן כ"פורסם". התאריך לא הוזז.</div>}

        <div className="editor-grid">
          <div className="editor-main">
            <label className="field">
              <span className="sr-only">{FIELD_LABEL.title}</span>
              <input id="editor-title" className="title-input" dir="auto" value={draft.title} maxLength={300}
                aria-label={FIELD_LABEL.title} onChange={(e) => set('title', e.target.value)} />
            </label>
            {conflictBox('title')}

            <TextArea label={FIELD_LABEL.brief} value={draft.brief} onChange={(v) => set('brief', v)} rows={4}
              placeholder="מה הזווית? למה זה מעניין עכשיו? למי זה מיועד?" />
            {conflictBox('brief')}

            <TextArea label={FIELD_LABEL.post_copy} value={draft.post_copy} onChange={(v) => set('post_copy', v)} rows={6}
              counter={2200} hint="הקופי הכללי של הפוסט. אינסטגרם מגביל ל-2,200 תווים." />
            {conflictBox('post_copy')}

            <SlidesEditor slides={draft.slides} onChange={(s) => set('slides', s)}
              askConfirm={(title, body, run) => setConfirm({ title, body, label: 'מחיקה', run })} />
            {conflictBox('slides')}

            <Comments itemId={base.id} />
          </div>

          <aside className="editor-side" aria-label="פרטי הכרטיס">
            <label className="field"><span>{FIELD_LABEL.status}</span>
              <select className={`status-select st-${draft.status}`} value={draft.status} onChange={(e) => set('status', e.target.value as EditableValues['status'])}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            {conflictBox('status')}

            <fieldset className="fieldset">
              <legend>שיבוץ</legend>
              <div className="grid2">
                <label className="field"><span>{FIELD_LABEL.planned_date}</span>
                  <input type="date" value={draft.planned_date ?? ''} onChange={(e) => set('planned_date', e.target.value)} />
                </label>
                <label className="field"><span>{FIELD_LABEL.planned_time} (לא חובה)</span>
                  <input type="time" value={draft.planned_time ?? ''} disabled={!draft.planned_date} onChange={(e) => set('planned_time', e.target.value)} />
                </label>
              </div>
              {draft.planned_date
                ? <button className="btn small block" onClick={() => set('planned_date', null)}>החזרה לבנק הרעיונות (הסרת התאריך)</button>
                : <p className="muted small">בלי תאריך — הכרטיס נמצא בבנק הרעיונות. בחרו תאריך כדי לשבץ אותו בלוח.</p>}
              {conflictBox('planned_date')}
            </fieldset>

            <div className="grid2">
              <label className="field"><span>{FIELD_LABEL.format}</span>
                <select value={draft.format ?? ''} onChange={(e) => set('format', e.target.value as EditableValues['format'])}>
                  <option value="">טרם נקבע</option>
                  {FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
              <label className="field"><span>{FIELD_LABEL.assignee}</span>
                <select value={draft.assignee ?? ''} onChange={(e) => set('assignee', e.target.value as EditableValues['assignee'])}>
                  <option value="">טרם נקבע</option>
                  {ASSIGNEES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
            </div>
            {conflictBox('format')}{conflictBox('assignee')}

            <label className="field"><span>{FIELD_LABEL.series}</span>
              <input dir="auto" list="series-options" value={draft.series ?? ''} maxLength={120}
                onChange={(e) => set('series', e.target.value)} placeholder="למשל: מאחורי הקלעים" />
              <datalist id="series-options">{seriesOptions.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            {conflictBox('series')}

            <Attachments itemId={base.id} askConfirm={(title, body, run) => setConfirm({ title, body, label: 'מחיקה', run })} />

            <LinksEditor links={draft.source_links} onChange={(l) => set('source_links', l)}
              askConfirm={(title, body, run) => setConfirm({ title, body, label: 'מחיקה', run })} />
            {conflictBox('source_links')}

            <fieldset className="fieldset">
              <legend>פרסום</legend>
              <label className="field"><span>{FIELD_LABEL.instagram_url}</span>
                <input type="url" dir="ltr" value={draft.instagram_url ?? ''} placeholder="https://www.instagram.com/p/…"
                  onChange={(e) => set('instagram_url', e.target.value)} />
              </label>
              {draft.instagram_url && /^https?:\/\//.test(draft.instagram_url) && (
                <a className="linkbtn" href={draft.instagram_url} target="_blank" rel="noopener noreferrer">פתיחת הפוסט ↗</a>
              )}
              <label className="field"><span>{FIELD_LABEL.published_on}</span>
                <input type="date" value={draft.published_on ?? ''} onChange={(e) => set('published_on', e.target.value)} />
              </label>
              {draft.status === 'published' && !draft.published_on && <p className="muted small">מומלץ למלא את תאריך הפרסום בפועל.</p>}
              {conflictBox('instagram_url')}{conflictBox('published_on')}
            </fieldset>

            <p className="muted small meta-line">
              נוצר {formatDateTimeHe(base.created_at)}{store.memberName(base.created_by) && ` ע״י ${store.memberName(base.created_by)}`}
              <br />עודכן לאחרונה {formatDateTimeHe(base.updated_at)}{store.memberName(base.updated_by) && ` ע״י ${store.memberName(base.updated_by)}`}
            </p>
            {!base.archived_at && (
              <button className="btn danger-outline block" onClick={() => setConfirm({
                title: 'להעביר לארכיון?', label: 'העברה לארכיון', run: archive,
                body: 'הכרטיס יוסר מהלוח ומבנק הרעיונות, יחד עם הקבצים וההערות שלו. אפשר לשחזר אותו בכל עת ממסך הארכיון.',
              })}>העברה לארכיון</button>
            )}
          </aside>
        </div>
      </div>
      {confirm && (
        <ConfirmDialog title={confirm.title} body={<p>{confirm.body}</p>} confirmLabel={confirm.label} danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => { const c = confirm; setConfirm(null); await c.run(); }} />
      )}
    </Dialog>
  );
}

function SaveIndicator({ state, dirty, savedAt, error, onRetry }: {
  state: SaveState; dirty: boolean; savedAt: number | null; error: string | null; onRetry: () => void;
}) {
  let content;
  if (state === 'saving') content = <span className="save saving"><span className="spinner" aria-hidden="true" />שומר…</span>;
  else if (state === 'error') content = (
    <span className="save error">⚠ לא נשמר. {error} <button className="btn small" onClick={onRetry}>ניסיון חוזר</button></span>
  );
  else if (state === 'conflict') content = <span className="save error">⚠ לא נשמר — הכרטיס השתנה במכשיר אחר</span>;
  else if (dirty) content = <span className="save pending">יש שינויים שממתינים לשמירה</span>;
  else if (savedAt) content = <span className="save ok">✓ נשמר בשרת ב-{formatClock(savedAt)}</span>;
  else content = <span className="save ok">✓ כל השינויים שמורים</span>;
  return <div className="save-indicator" role="status" aria-live="polite">{content}</div>;
}

function TextArea({ label, value, onChange, rows, placeholder, counter, hint }: {
  label: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string; counter?: number; hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-head">{label}{counter && <span className={`counter ${value.length > counter ? 'over' : ''}`}>{value.length.toLocaleString('he-IL')}/{counter.toLocaleString('he-IL')}</span>}</span>
      <textarea dir="auto" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
}

function SlidesEditor({ slides, onChange, askConfirm }: {
  slides: Slide[]; onChange: (s: Slide[]) => void; askConfirm: (t: string, b: string, run: () => void) => void;
}) {
  const [openCaption, setOpenCaption] = useState<Record<string, boolean>>({});
  const upd = (i: number, patch: Partial<Slide>) => onChange(slides.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= slides.length) return;
    const n = slides.slice();
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
    setTimeout(() => document.getElementById(`slide-${n[j].id}`)?.querySelector<HTMLButtonElement>(d < 0 ? '.mv-up' : '.mv-down')?.focus(), 0);
  };
  const remove = (i: number) => {
    const s = slides[i];
    const run = () => onChange(slides.filter((_, j) => j !== i));
    if (s.title || s.text || s.caption) askConfirm(`למחוק את שקף ${i + 1}?`, 'הכותרת, הטקסט והקאפשן של השקף יימחקו.', run);
    else run();
  };
  return (
    <section className="slides" aria-label="שקפים">
      <div className="field-head"><h3>כותרות וטקסטים לשקפים</h3><span className="muted small">{slides.length ? `${slides.length} שקפים` : ''}</span></div>
      {slides.length === 0 && <p className="muted small">עוד אין שקפים. לקרוסלה — הוסיפו שקף לכל עמוד.</p>}
      <ol className="slide-list">
        {slides.map((s, i) => (
          <li key={s.id} id={`slide-${s.id}`} className="slide">
            <div className="slide-head">
              <span className="slide-num" aria-hidden="true">{i + 1}</span>
              <input dir="auto" className="slide-title" value={s.title} placeholder="כותרת השקף"
                aria-label={`כותרת שקף ${i + 1}`} onChange={(e) => upd(i, { title: e.target.value })} />
              <div className="slide-tools">
                <button className="btn icon small mv-up" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`הזזת שקף ${i + 1} למעלה`}>▲</button>
                <button className="btn icon small mv-down" onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label={`הזזת שקף ${i + 1} למטה`}>▼</button>
                <button className="btn icon small" onClick={() => remove(i)} aria-label={`מחיקת שקף ${i + 1}`}>✕</button>
              </div>
            </div>
            <textarea dir="auto" rows={3} value={s.text} placeholder="טקסט השקף" aria-label={`טקסט שקף ${i + 1}`}
              onChange={(e) => upd(i, { text: e.target.value })} />
            {(s.caption || openCaption[s.id]) ? (
              <label className="field caption-field"><span className="small">קאפשן לשקף {i + 1} (בנוסף לקופי הכללי)</span>
                <textarea dir="auto" rows={2} value={s.caption} onChange={(e) => upd(i, { caption: e.target.value })} autoFocus={!s.caption} />
              </label>
            ) : (
              <button className="linkbtn small" onClick={() => setOpenCaption({ ...openCaption, [s.id]: true })}>＋ קאפשן נפרד לשקף</button>
            )}
          </li>
        ))}
      </ol>
      <button className="btn" onClick={() => onChange([...slides, { id: uid(), title: '', text: '', caption: '' }])}>＋ הוספת שקף</button>
    </section>
  );
}

function LinksEditor({ links, onChange, askConfirm }: {
  links: SourceLink[]; onChange: (l: SourceLink[]) => void; askConfirm: (t: string, b: string, run: () => void) => void;
}) {
  const upd = (i: number, p: Partial<SourceLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <fieldset className="fieldset">
      <legend>{FIELD_LABEL.source_links}</legend>
      {links.map((l, i) => (
        <div key={l.id} className="link-row">
          <input dir="auto" value={l.label} placeholder="תיאור (לא חובה)" aria-label={`תיאור קישור ${i + 1}`} onChange={(e) => upd(i, { label: e.target.value })} />
          <input dir="ltr" type="url" value={l.url} placeholder="https://" aria-label={`כתובת קישור ${i + 1}`} onChange={(e) => upd(i, { url: e.target.value })} />
          <div className="row gap">
            {/^https?:\/\//.test(l.url) && <a className="btn small" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`פתיחת קישור ${i + 1}`}>↗</a>}
            <button className="btn small icon" aria-label={`מחיקת קישור ${i + 1}`}
              onClick={() => (l.url || l.label) ? askConfirm('למחוק את הקישור?', l.label || l.url, () => onChange(links.filter((_, j) => j !== i))) : onChange(links.filter((_, j) => j !== i))}>✕</button>
          </div>
        </div>
      ))}
      <button className="btn small" onClick={() => onChange([...links, { id: uid(), url: '', label: '' }])}>＋ הוספת קישור</button>
    </fieldset>
  );
}
