import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { hebrewError } from './errors';
import type { ContentItem, EditableValues, Member } from './types';

export type ItemPatch = Partial<EditableValues> & { archived_at?: string | null };

export type UpdateResult =
  | { ok: true; item: ContentItem }
  | { ok: false; conflict: true; latest: ContentItem | null }
  | { ok: false; conflict: false; error: string; network: boolean };

interface Toast { id: number; text: string; kind: 'info' | 'error' | 'success' }

interface Store {
  session: Session;
  me: Member | null;
  members: Member[];
  items: ContentItem[];
  loading: boolean;
  loadError: string | null;
  online: boolean;
  realtimeOk: boolean;
  reload: () => Promise<void>;
  createItem: (values: Partial<EditableValues> & { title: string }) => Promise<{ item?: ContentItem; error?: string }>;
  /** עדכון מותנה בגרסה — אם מישהו אחר שמר בינתיים, מוחזר conflict ולא נדרס דבר */
  updateItem: (id: string, version: number, patch: ItemPatch) => Promise<UpdateResult>;
  fetchItem: (id: string) => Promise<ContentItem | null>;
  deleteItemForever: (item: ContentItem) => Promise<string | null>;
  memberName: (userId: string | null) => string;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('store missing');
  return s;
};

function normalize(row: ContentItem): ContentItem {
  return {
    ...row,
    slides: Array.isArray(row.slides) ? row.slides : [],
    source_links: Array.isArray(row.source_links) ? row.source_links : [],
    planned_time: row.planned_time ? row.planned_time.slice(0, 5) : null,
  };
}

export function StoreProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const upsertLocal = useCallback((row: ContentItem) => {
    const n = normalize(row);
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === n.id);
      if (i === -1) return [...prev, n];
      if (prev[i].version > n.version) return prev; // לא חוזרים לגרסה ישנה
      const copy = prev.slice();
      copy[i] = n;
      return copy;
    });
  }, []);

  const reload = useCallback(async () => {
    const [m, it] = await Promise.all([
      supabase.from('members').select('*'),
      supabase.from('content_items').select('*').order('planned_date', { ascending: true, nullsFirst: false }),
    ]);
    if (m.error || it.error) {
      setLoadError(hebrewError(m.error || it.error));
      setLoading(false);
      return;
    }
    setMembers(m.data as Member[]);
    setItems((it.data as ContentItem[]).map(normalize));
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // עדכונים בזמן אמת מהמכשיר השני
  useEffect(() => {
    const channel = supabase
      .channel('content-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setItems((prev) => prev.filter((x) => x.id !== id));
        } else if ((payload.new as { id?: string })?.id && !(payload as { errors?: unknown }).errors) {
          upsertLocal(payload.new as ContentItem);
        }
      })
      .subscribe((status) => {
        if (import.meta.env.DEV || localStorage.getItem('gp:debug')) console.info('realtime', status);
        if (status === 'SUBSCRIBED') { setRealtimeOk(true); void reload(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeOk(false);
      });
    return () => { void supabase.removeChannel(channel); };
  }, [reload, upsertLocal]);

  // רענון כשחוזרים ללשונית או כשהרשת חוזרת — גיבוי למקרה שחיבור הזמן-אמת נרדם (נפוץ בנייד)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void reload(); };
    const onOnline = () => { setOnline(true); void reload(); };
    const onOffline = () => setOnline(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [reload]);

  const fetchItem = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('content_items').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (data) upsertLocal(data as ContentItem);
    return data ? normalize(data as ContentItem) : null;
  }, [upsertLocal]);

  const createItem: Store['createItem'] = useCallback(async (values) => {
    const { data, error } = await supabase.from('content_items').insert(values).select('*').single();
    if (error) return { error: hebrewError(error) };
    upsertLocal(data as ContentItem);
    return { item: normalize(data as ContentItem) };
  }, [upsertLocal]);

  const updateItem: Store['updateItem'] = useCallback(async (id, version, patch) => {
    const { data, error } = await supabase
      .from('content_items').update(patch).eq('id', id).eq('version', version).select('*');
    if (error) {
      const net = /fetch|network|load failed/i.test(String(error.message)) || !navigator.onLine;
      return { ok: false, conflict: false, error: hebrewError(error), network: net };
    }
    if (data && data.length === 1) {
      upsertLocal(data[0] as ContentItem);
      return { ok: true, item: normalize(data[0] as ContentItem) };
    }
    // לא עודכנה אף שורה: הגרסה השתנתה (מישהו אחר שמר) או שהכרטיס נמחק
    try {
      const latest = await fetchItem(id);
      return { ok: false, conflict: true, latest };
    } catch (e) {
      return { ok: false, conflict: false, error: hebrewError(e), network: true };
    }
  }, [fetchItem, upsertLocal]);

  const deleteItemForever = useCallback(async (item: ContentItem) => {
    const att = await supabase.from('attachments').select('storage_path').eq('item_id', item.id);
    if (att.error) return hebrewError(att.error);
    const paths = (att.data ?? []).map((a) => a.storage_path as string);
    if (paths.length) {
      const rm = await supabase.storage.from('attachments').remove(paths);
      if (rm.error) return hebrewError(rm.error);
    }
    const { error, count } = await supabase.from('content_items').delete({ count: 'exact' }).eq('id', item.id);
    if (error) return hebrewError(error);
    if (!count) return 'הכרטיס לא נמחק — אפשר למחוק רק כרטיס שנמצא בארכיון.';
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    return null;
  }, []);

  const me = useMemo(() => members.find((m) => m.user_id === session.user.id) ?? null, [members, session.user.id]);
  const memberName = useCallback(
    (userId: string | null) => members.find((m) => m.user_id === userId)?.display_name ?? '',
    [members],
  );

  const value: Store = {
    session, me, members, items, loading, loadError, online, realtimeOk, reload,
    createItem, updateItem, fetchItem, deleteItemForever, memberName, toasts, toast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
