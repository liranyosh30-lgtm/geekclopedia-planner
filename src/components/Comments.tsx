import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { hebrewError } from '../lib/errors';
import { formatDateTimeHe } from '../lib/dates';
import type { Comment } from '../lib/types';
import { ConfirmDialog } from './ui';

export default function Comments({ itemId }: { itemId: string }) {
  const { session, toast } = useStore();
  const key = `gp:comment-draft:${itemId}`;
  const [list, setList] = useState<Comment[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [body, setBody] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Comment | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('comments').select('*').eq('item_id', itemId).order('created_at');
    if (error) setLoadErr(hebrewError(error)); else { setList(data as Comment[]); setLoadErr(null); }
  }, [itemId]);

  useEffect(() => {
    void load();
    const ch = supabase.channel(`comments-${itemId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `item_id=eq.${itemId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [itemId, load]);

  useEffect(() => { try { if (body) localStorage.setItem(key, body); else localStorage.removeItem(key); } catch { /* */ } }, [body, key]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true); setSendErr(null);
    const { data, error } = await supabase.from('comments').insert({ item_id: itemId, body: body.trim() }).select('*').single();
    setSending(false);
    if (error) { setSendErr(hebrewError(error)); return; }
    setList((l) => (l.some((c) => c.id === data.id) ? l : [...l, data as Comment]));
    setBody('');
  };

  return (
    <section className="comments" aria-label="הערות ותגובות">
      <h3>הערות ותגובות {list.length > 0 && <span className="count">{list.length}</span>}</h3>
      {loadErr && <p className="error-text" role="alert">{loadErr} <button className="linkbtn" onClick={() => void load()}>ניסיון חוזר</button></p>}
      <ul className="comment-list">
        {list.map((c) => (
          <li key={c.id} className="comment">
            <div className="comment-head">
              <strong>{c.author_name || 'משתמש'}</strong>
              <time className="muted small" dateTime={c.created_at}>{formatDateTimeHe(c.created_at)}</time>
              {c.author_id === session.user.id && (
                <button className="linkbtn small" onClick={() => setToDelete(c)} aria-label="מחיקת ההערה שלי">מחיקה</button>
              )}
            </div>
            <p dir="auto" className="comment-body">{c.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="comment-form">
        <label className="field"><span className="sr-only">הערה חדשה</span>
          <textarea dir="auto" rows={2} value={body} maxLength={5000} placeholder="כתבו הערה…" onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(e); }} />
        </label>
        {sendErr && <p className="error-text" role="alert">{sendErr} ההערה לא נשלחה, והטקסט נשאר כאן.</p>}
        <div className="row gap end">
          <span className="muted small">Ctrl+Enter לשליחה</span>
          <button className="btn primary small" disabled={sending || !body.trim()}>{sending ? 'שולח…' : sendErr ? 'ניסיון חוזר' : 'שליחת הערה'}</button>
        </div>
      </form>
      {toDelete && (
        <ConfirmDialog title="למחוק את ההערה?" danger confirmLabel="מחיקה"
          body={<p dir="auto">{toDelete.body.slice(0, 200)}</p>}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            const c = toDelete; setToDelete(null);
            const { error } = await supabase.from('comments').delete().eq('id', c.id);
            if (error) toast(hebrewError(error), 'error'); else setList((l) => l.filter((x) => x.id !== c.id));
          }} />
      )}
    </section>
  );
}
