import { useCallback, useEffect, useRef, useState } from 'react';
import { BUCKET, supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { hebrewError } from '../lib/errors';
import { formatDateTimeHe } from '../lib/dates';
import { FILE_ACCEPT, FILE_LIMITS_TEXT, FILE_MAX_BYTES, FILE_TYPES, type Attachment } from '../lib/types';

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime', txt: 'text/plain',
};

export function fileMime(f: File): string {
  if (f.type && FILE_TYPES[f.type]) return f.type;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? f.type ?? '';
}
export const formatSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`);

interface Upload { name: string; state: 'uploading' | 'error'; error?: string; file: File }

export default function Attachments({ itemId, askConfirm }: { itemId: string; askConfirm: (t: string, b: string, run: () => Promise<void>) => void }) {
  const { toast, memberName } = useStore();
  const [list, setList] = useState<Attachment[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('attachments').select('*').eq('item_id', itemId).order('created_at');
    if (error) { setLoadErr(hebrewError(error)); return; }
    setLoadErr(null);
    const rows = data as Attachment[];
    setList(rows);
    const imgs = rows.filter((a) => a.mime_type.startsWith('image/') && !a.mime_type.includes('hei'));
    if (imgs.length) {
      // קישורים חתומים לשעה — הקבצים עצמם נשארים פרטיים
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(imgs.map((a) => a.storage_path), 3600);
      const map: Record<string, string> = {};
      signed?.forEach((s) => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
      setThumbs(map);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
    const ch = supabase.channel(`attachments-${itemId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `item_id=eq.${itemId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [itemId, load]);

  const uploadOne = async (file: File) => {
    const mime = fileMime(file);
    if (!FILE_TYPES[mime]) { toast(`"${file.name}": סוג הקובץ אינו נתמך. ${FILE_LIMITS_TEXT}`, 'error'); return; }
    if (file.size > FILE_MAX_BYTES) { toast(`"${file.name}" גדול מדי (${formatSize(file.size)}). המקסימום הוא 25MB.`, 'error'); return; }
    setUploads((u) => [...u.filter((x) => x.file !== file), { name: file.name, state: 'uploading', file }]);
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
    const path = `items/${itemId}/${crypto.randomUUID()}.${ext || 'bin'}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (up.error) {
      setUploads((u) => u.map((x) => (x.file === file ? { ...x, state: 'error', error: hebrewError(up.error) } : x)));
      return;
    }
    const { error } = await supabase.from('attachments').insert({
      item_id: itemId, storage_path: path, file_name: file.name.slice(0, 255), mime_type: mime, size_bytes: file.size,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      setUploads((u) => u.map((x) => (x.file === file ? { ...x, state: 'error', error: hebrewError(error) } : x)));
      return;
    }
    setUploads((u) => u.filter((x) => x.file !== file));
    toast(`"${file.name}" הועלה ונשמר`, 'success');
    void load();
  };

  const openFile = async (a: Attachment, download = false) => {
    const w = download ? null : window.open('', '_blank');
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600, download ? { download: a.file_name } : undefined);
    if (error || !data) { w?.close(); toast(hebrewError(error), 'error'); return; }
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  };

  const remove = async (a: Attachment) => {
    const rm = await supabase.storage.from(BUCKET).remove([a.storage_path]);
    if (rm.error) { toast(hebrewError(rm.error), 'error'); return; }
    const { error } = await supabase.from('attachments').delete().eq('id', a.id);
    if (error) { toast(hebrewError(error), 'error'); return; }
    setList((l) => l.filter((x) => x.id !== a.id));
    toast('הקובץ נמחק', 'success');
  };

  return (
    <fieldset className="fieldset attachments">
      <legend>תמונות וקבצים</legend>
      <p className="muted small" id={`limits-${itemId}`}>{FILE_LIMITS_TEXT}. הקבצים פרטיים — נגישים רק ללירן ולאלה.</p>
      {loadErr && <p className="error-text" role="alert">{loadErr} <button className="linkbtn" onClick={() => void load()}>ניסיון חוזר</button></p>}
      <ul className="file-list">
        {list.map((a) => (
          <li key={a.id} className="file">
            {thumbs[a.storage_path]
              ? <img src={thumbs[a.storage_path]} alt="" className="thumb" loading="lazy" />
              : <span className="thumb ph" aria-hidden="true">{FILE_TYPES[a.mime_type] ?? 'קובץ'}</span>}
            <span className="file-info">
              <button className="linkbtn file-name" dir="auto" onClick={() => void openFile(a)}>{a.file_name}</button>
              <span className="muted small">{formatSize(a.size_bytes)} · {memberName(a.uploaded_by) || '—'} · {formatDateTimeHe(a.created_at)}</span>
            </span>
            <span className="row gap">
              <button className="btn small icon" onClick={() => void openFile(a, true)} aria-label={`הורדת ${a.file_name}`}>⤓</button>
              <button className="btn small icon" aria-label={`מחיקת ${a.file_name}`}
                onClick={() => askConfirm('למחוק את הקובץ?', `"${a.file_name}" יימחק מהאחסון המשותף. אי אפשר לבטל.`, () => remove(a))}>✕</button>
            </span>
          </li>
        ))}
        {uploads.map((u) => (
          <li key={u.name} className={`file ${u.state}`}>
            <span className="thumb ph" aria-hidden="true">{u.state === 'uploading' ? <span className="spinner" /> : '!'}</span>
            <span className="file-info">
              <span dir="auto">{u.name}</span>
              <span className={u.state === 'error' ? 'error-text small' : 'muted small'} role={u.state === 'error' ? 'alert' : 'status'}>
                {u.state === 'uploading' ? 'מעלה… (הקובץ עוד לא נשמר)' : `ההעלאה נכשלה: ${u.error}`}
              </span>
            </span>
            {u.state === 'error' && (
              <span className="row gap">
                <button className="btn small" onClick={() => void uploadOne(u.file)}>ניסיון חוזר</button>
                <button className="btn small icon" aria-label="ביטול" onClick={() => setUploads((x) => x.filter((y) => y !== u))}>✕</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <input ref={inputRef} type="file" multiple accept={FILE_ACCEPT} className="sr-only" id={`file-${itemId}`}
        aria-describedby={`limits-${itemId}`}
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; files.forEach((f) => void uploadOne(f)); }} />
      <label htmlFor={`file-${itemId}`} className="btn small" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}>＋ צירוף קבצים</label>
    </fieldset>
  );
}
