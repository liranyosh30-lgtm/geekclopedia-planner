import Brand from './Brand';
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { hebrewError } from '../lib/errors';
import { Dialog } from './ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(hebrewError(error));
  };

  const forgot = async () => {
    if (!email.trim()) { setError('כתבו קודם את כתובת האימייל.'); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: location.origin + location.pathname,
    });
    setBusy(false);
    if (error) setError(hebrewError(error));
    else setInfo('אם הכתובת מורשית, יישלח אליה קישור לאיפוס סיסמה. אם המייל לא מגיע, לירן יכול לאפס את הסיסמה מלוח הבקרה של Supabase.');
  };

  return (
    <main className="center-screen login-bg">
      <form className="panel narrow login" onSubmit={submit} noValidate>
        <Brand big />
        <p className="muted">כניסה למשתמשים מורשים בלבד.</p>
        <label className="field">
          <span>אימייל</span>
          <input type="email" dir="ltr" autoComplete="username" value={email} required
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>סיסמה</span>
          <input type="password" dir="ltr" autoComplete="current-password" value={password} required
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        {info && <p className="info-text" role="status">{info}</p>}
        <button className="btn primary block" type="submit" disabled={busy || !email || !password}>
          {busy ? 'מתחבר…' : 'כניסה'}
        </button>
        <button type="button" className="linkbtn" onClick={forgot} disabled={busy}>שכחתי סיסמה</button>
      </form>
    </main>
  );
}

export function SetPassword({ onDone, asDialog = false }: { onDone: () => void; asDialog?: boolean }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { setError('הסיסמה צריכה להכיל לפחות 8 תווים.'); return; }
    if (pw !== pw2) { setError('הסיסמאות אינן זהות.'); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(hebrewError(error));
    else setOk(true);
  };

  const form = (
    <form className="dialog-body" onSubmit={submit}>
      <h2>בחירת סיסמה חדשה</h2>
      {ok ? (
        <>
          <p className="info-text" role="status">הסיסמה עודכנה ונשמרה.</p>
          <button type="button" className="btn primary" onClick={onDone}>סגירה</button>
        </>
      ) : (
        <>
          <label className="field"><span>סיסמה חדשה (לפחות 8 תווים)</span>
            <input type="password" dir="ltr" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <label className="field"><span>הקלידו שוב</span>
            <input type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="row gap end">
            <button type="button" className="btn" onClick={onDone}>ביטול</button>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירת סיסמה'}</button>
          </div>
        </>
      )}
    </form>
  );
  if (asDialog) return <Dialog title="שינוי סיסמה" onClose={onDone}>{form}</Dialog>;
  return <main className="center-screen"><div className="panel narrow">{form}</div></main>;
}
