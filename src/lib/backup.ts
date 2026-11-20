import JSZip from 'jszip';
import { BUCKET, supabase } from './supabase';
import type { Attachment, Comment, ContentItem, Member } from './types';

export const BACKUP_FORMAT = 'geekclopedia-planner-backup';

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  schema_version: 1;
  exported_at: string;
  members: Pick<Member, 'key' | 'email' | 'display_name' | 'user_id'>[];
  items: ContentItem[];
  comments: Comment[];
  attachments: Attachment[];
}

const README = `גיבוי — גיקלופדיה · תכנון תוכן

מה כלול בגיבוי:
• backup.json — כל כרטיסי התוכן (כולל ארכיון), השקפים, הקישורים, ההערות ופרטי הקבצים המצורפים.
• files/ — עותק של כל הקבצים המצורפים (תמונות, PDF, וידאו).

מה לא כלול בגיבוי:
• חשבונות המשתמשים והסיסמאות (מנוהלים ב-Supabase Auth). בשחזור לפרויקט חדש יוצרים מחדש את שני המשתמשים.
• רשימת המשתמשים המורשים (טבלת members) — מופיעה בקובץ לעיון בלבד ואינה משוחזרת אוטומטית.
• הגדרות הפרויקט ב-Supabase ובאתר (מפתחות, כתובות, הגדרות התחברות).
• טיוטות שלא נשמרו לשרת ונמצאות רק בדפדפן של מכשיר מסוים.

שחזור: במסך "גיבוי" באפליקציה בוחרים את קובץ ה-zip הזה. השחזור ממזג לפי מזהה — לא מוחק תוכן קיים.
`;

async function fetchAll<T>(table: string, order: string, tieBreak = 'id'): Promise<T[]> {
  const out: T[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').order(order).order(tieBreak).range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < page) return out;
  }
}

export async function exportBackup(onProgress: (msg: string) => void): Promise<{ blob: Blob; missing: string[]; data: BackupData }> {
  onProgress('טוען נתונים…');
  const [members, items, comments, attachments] = await Promise.all([
    fetchAll<Member>('members', 'key', 'email'),
    fetchAll<ContentItem>('content_items', 'created_at'),
    fetchAll<Comment>('comments', 'created_at'),
    fetchAll<Attachment>('attachments', 'created_at'),
  ]);
  const data: BackupData = {
    format: BACKUP_FORMAT, schema_version: 1, exported_at: new Date().toISOString(),
    members: members.map(({ key, email, display_name, user_id }) => ({ key, email, display_name, user_id })),
    items, comments, attachments,
  };
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(data, null, 2));
  zip.file('README.txt', README);
  const missing: string[] = [];
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    onProgress(`מוריד קבצים ${i + 1}/${attachments.length}…`);
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(a.storage_path);
    if (error || !blob) { missing.push(a.file_name); continue; }
    zip.file(`files/${a.storage_path}`, blob);
  }
  onProgress('אורז את הקובץ…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, missing, data };
}

export interface ParsedBackup { data: BackupData; zip: JSZip; filesInZip: number }

export async function parseBackup(file: File): Promise<ParsedBackup> {
  const zip = await JSZip.loadAsync(file);
  const json = zip.file('backup.json');
  if (!json) throw new Error('bad-backup');
  const data = JSON.parse(await json.async('string')) as BackupData;
  if (data.format !== BACKUP_FORMAT || !Array.isArray(data.items)) throw new Error('bad-backup');
  const filesInZip = Object.keys(zip.files).filter((n) => n.startsWith('files/') && !zip.files[n].dir).length;
  return { data, zip, filesInZip };
}

export async function restoreBackup(p: ParsedBackup, currentMembers: Member[], onProgress: (msg: string) => void) {
  const { data, zip } = p;
  // מיפוי מזהי משתמשים לפי אימייל — בפרויקט אחר למשתמשים יש מזהים אחרים
  const map = new Map<string, string | null>();
  for (const m of data.members ?? []) {
    if (!m.user_id) continue;
    const cur = currentMembers.find((c) => c.email.toLowerCase() === m.email.toLowerCase());
    map.set(m.user_id, cur?.user_id ?? null);
  }
  const mapId = (id: string | null) => (id ? map.get(id) ?? null : null);

  const missingFiles: string[] = [];
  for (let i = 0; i < data.attachments.length; i++) {
    const a = data.attachments[i];
    onProgress(`מעלה קבצים ${i + 1}/${data.attachments.length}…`);
    const f = zip.file(`files/${a.storage_path}`);
    if (!f) { missingFiles.push(a.file_name); continue; }
    // סוג הקובץ חייב להיות מוצמד לקובץ עצמו, אחרת האחסון דוחה אותו
    const blob = new Blob([await f.async('arraybuffer')], { type: a.mime_type });
    const { error } = await supabase.storage.from(BUCKET).upload(a.storage_path, blob, { contentType: a.mime_type, upsert: true });
    if (error) throw error;
  }
  onProgress('משחזר כרטיסים והערות…');
  const payload = {
    items: data.items.map((it) => ({ ...it, created_by: mapId(it.created_by), updated_by: mapId(it.updated_by) })),
    comments: data.comments.map((c) => ({ ...c, author_id: mapId(c.author_id) })),
    attachments: data.attachments
      .filter((a) => zip.file(`files/${a.storage_path}`))
      .map((a) => ({ ...a, uploaded_by: mapId(a.uploaded_by) })),
  };
  const { data: res, error } = await supabase.rpc('restore_backup', { payload });
  if (error) throw error;
  return { result: res as { items: number; comments: number; attachments: number }, missingFiles };
}
