import { useState } from 'react';
import { useStore } from '../lib/store';
import { hebrewError } from '../lib/errors';
import { exportBackup, parseBackup, restoreBackup, type ParsedBackup } from '../lib/backup';
import { formatDateTimeHe, todayISO } from '../lib/dates';
import { ConfirmDialog } from './ui';

export default function BackupView() {
  const { members, reload, toast } = useStore();
  const [progress, setProgress] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  const doExport = async () => {
    setError(null); setExportResult(null);
    try {
      const { blob, missing, data } = await exportBackup(setProgress);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `geekclopedia-backup-${todayISO()}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setExportResult(`הגיבוי הורד: ${data.items.length} כרטיסים, ${data.comments.length} הערות, ${data.attachments.length - missing.length} קבצים.` +
        (missing.length ? ` שימו לב: ${missing.length} קבצים לא הורדו (${missing.join(', ')}).` : ''));
    } catch (e) { setError(hebrewError(e)); }
    setProgress(null);
  };

  const pick = async (file: File | undefined) => {
    setError(null); setRestoreResult(null); setParsed(null);
    if (!file) return;
    try { setParsed(await parseBackup(file)); }
    catch (e) { setError((e as Error).message === 'bad-backup' ? 'הקובץ אינו גיבוי תקין של המערכת.' : 'לא ניתן לקרוא את הקובץ. ודאו שזה קובץ ה-zip שהורד מהמערכת.'); }
  };

  const doRestore = async () => {
    if (!parsed) return;
    const p = parsed; setParsed(null); setError(null);
    try {
      const { result, missingFiles } = await restoreBackup(p, members, setProgress);
      await reload();
      setRestoreResult(`השחזור הושלם ונשמר בשרת: ${result.items} כרטיסים עודכנו או נוצרו, ${result.comments} הערות ו-${result.attachments} קבצים חדשים נוספו.` +
        (missingFiles.length ? ` ${missingFiles.length} קבצים לא נמצאו בגיבוי ולא שוחזרו.` : ''));
      toast('השחזור הושלם', 'success');
    } catch (e) { setError(`השחזור נכשל ולא שונו כרטיסים. ${hebrewError(e)}`); }
    setProgress(null);
  };

  return (
    <section aria-label="גיבוי ושחזור" className="backup">
      <h1>גיבוי ושחזור</h1>

      <div className="panel">
        <h2>ייצוא גיבוי</h2>
        <p>מוריד קובץ zip עם כל התוכן: כרטיסים (כולל ארכיון), שקפים, קישורים, הערות, וכל הקבצים המצורפים.</p>
        <p className="muted small"><strong>לא כלול בגיבוי:</strong> חשבונות המשתמשים והסיסמאות, הגדרות Supabase והאתר, וטיוטות שלא נשמרו לשרת. רשימת המשתמשים המורשים נשמרת בקובץ לעיון בלבד.</p>
        <p className="muted small">מומלץ לגבות פעם בחודש ולשמור את הקובץ ב-Google Drive או במחשב. כל ייצוא מוריד את כל הקבצים ונספר במכסת התעבורה החודשית (5GB).</p>
        <button className="btn primary" onClick={doExport} disabled={!!progress}>הורדת גיבוי מלא</button>
        {exportResult && <p className="info-text" role="status">{exportResult}</p>}
      </div>

      <div className="panel">
        <h2>שחזור מגיבוי</h2>
        <p>בוחרים קובץ גיבוי. השחזור <strong>ממזג</strong> לפי מזהה: כרטיסים מהגיבוי מחליפים את הגרסה הנוכחית שלהם, כרטיסים חסרים נוצרים, ושום דבר לא נמחק.</p>
        <label className="field">
          <span>קובץ גיבוי (zip)</span>
          <input type="file" accept=".zip,application/zip" onChange={(e) => void pick(e.target.files?.[0])} disabled={!!progress} />
        </label>
        {restoreResult && <p className="info-text" role="status">{restoreResult}</p>}
      </div>

      {progress && <p className="info-text" role="status"><span className="spinner" aria-hidden="true" /> {progress}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}

      {parsed && (
        <ConfirmDialog title="לשחזר מהגיבוי?" confirmLabel="שחזור"
          body={<>
            <p>גיבוי מתאריך {formatDateTimeHe(parsed.data.exported_at)}:</p>
            <ul>
              <li>{parsed.data.items.length} כרטיסים</li>
              <li>{parsed.data.comments.length} הערות</li>
              <li>{parsed.data.attachments.length} קבצים ({parsed.filesInZip} נמצאים בקובץ)</li>
            </ul>
            <p>כרטיסים שקיימים גם עכשיו יוחלפו בגרסה מהגיבוי. מומלץ להוריד קודם גיבוי של המצב הנוכחי.</p>
          </>}
          onCancel={() => setParsed(null)} onConfirm={() => void doRestore()} />
      )}
    </section>
  );
}
