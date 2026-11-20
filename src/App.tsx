import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import { StoreProvider, useStore } from './lib/store';
import { useRoute, type View } from './lib/router';
import { useFilters } from './lib/filters';
import { monthKey } from './lib/dates';
import Login, { SetPassword } from './components/Login';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import IdeaBank from './components/IdeaBank';
import ArchiveView from './components/ArchiveView';
import BackupView from './components/BackupView';
import Editor from './components/Editor';
import NewItemDialog, { type NewItemPreset } from './components/NewItemDialog';
import FiltersBar from './components/FiltersBar';
import { Toasts } from './components/ui';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>המערכת עוד לא חוברה למסד הנתונים</h1>
          <p>חסרים הערכים VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY. ראו את המדריך docs/SETUP.md.</p>
        </div>
      </main>
    );
  }
  if (session === undefined) return <main className="center-screen"><p className="muted">טוען…</p></main>;
  if (recovery && session) return <SetPassword onDone={() => setRecovery(false)} />;
  if (!session) return <Login />;
  return (
    <StoreProvider session={session}>
      <Shell />
    </StoreProvider>
  );
}

const NAV: { view: View; label: string }[] = [
  { view: 'calendar', label: 'לוח חודשי' },
  { view: 'list', label: 'רשימה' },
  { view: 'ideas', label: 'בנק רעיונות' },
  { view: 'archive', label: 'ארכיון' },
  { view: 'backup', label: 'גיבוי' },
];

function Shell() {
  const store = useStore();
  const [route, go] = useRoute();
  const [filters, setFilters] = useFilters();
  const [newPreset, setNewPreset] = useState<NewItemPreset | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const month = route.month ?? monthKey(new Date());
  const openItem = (id: string) => go({ ...route, open: id });
  const closeItem = () => go({ ...route, open: undefined });
  const startNew = (preset: NewItemPreset = {}) => setNewPreset(preset);

  if (store.loading) return <main className="center-screen"><p className="muted">טוען את הלוח…</p></main>;

  if (!store.me) {
    return (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>אין גישה</h1>
          <p>
            {store.loadError
              ? store.loadError
              : `החשבון ${store.session.user.email ?? ''} אינו ברשימת המשתמשים המורשים של המערכת.`}
          </p>
          <div className="row gap">
            {store.loadError && <button className="btn" onClick={() => void store.reload()}>נסו שוב</button>}
            <button className="btn" onClick={() => void supabase.auth.signOut()}>יציאה</button>
          </div>
        </div>
      </main>
    );
  }

  const showFilters = route.view === 'calendar' || route.view === 'list' || route.view === 'ideas';

  return (
    <div className="app">
      <a className="skip-link" href="#main">דילוג לתוכן</a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">ג</span>
          <span className="brand-text"><strong>גיקלופדיה</strong><span>תכנון תוכן</span></span>
        </div>
        <nav className="mainnav" aria-label="ניווט ראשי">
          {NAV.map((n) => (
            <a key={n.view} href={`#/${n.view}${n.view === 'calendar' || n.view === 'list' ? '/' + month : ''}`}
              aria-current={route.view === n.view ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); go({ view: n.view, month }); }}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="topbar-actions">
          <button className="btn primary new-btn" onClick={() => startNew({})}>
            <span aria-hidden="true">＋</span> תוכן חדש
          </button>
          <details className="usermenu">
            <summary aria-label={`תפריט משתמש: ${store.me.display_name}`}>
              <span className={`avatar av-${store.me.key}`} aria-hidden="true">{store.me.display_name[0]}</span>
            </summary>
            <div className="usermenu-pop">
              <p className="muted small">מחובר/ת כ{store.me.display_name}<br /><span dir="ltr">{store.session.user.email}</span></p>
              <button className="btn block" onClick={() => setShowPassword(true)}>שינוי סיסמה</button>
              <button className="btn block" onClick={() => void supabase.auth.signOut()}>יציאה</button>
            </div>
          </details>
        </div>
      </header>

      {!store.online && (
        <div className="banner warn" role="status">
          אין חיבור לאינטרנט. אפשר להמשיך לכתוב — הטקסט נשמר במכשיר הזה ויישלח לשרת כשהחיבור יחזור.
        </div>
      )}
      {store.online && !store.realtimeOk && (
        <div className="banner info" role="status">
          העדכונים בזמן אמת מנותקים כרגע. הנתונים יתרעננו אוטומטית כשתחזרו ללשונית.
          <button className="linkbtn" onClick={() => void store.reload()}>רענון עכשיו</button>
        </div>
      )}

      {showFilters && <FiltersBar filters={filters} onChange={setFilters} />}

      <main id="main" className="main" tabIndex={-1}>
        {route.view === 'calendar' && (
          <CalendarView month={month} filters={filters} onMonth={(m) => go({ view: 'calendar', month: m })}
            onOpen={openItem} onNew={startNew} />
        )}
        {route.view === 'list' && (
          <ListView month={month} filters={filters} onMonth={(m) => go({ view: 'list', month: m })}
            onOpen={openItem} onNew={startNew} />
        )}
        {route.view === 'ideas' && <IdeaBank filters={filters} onOpen={openItem} onNew={startNew} />}
        {route.view === 'archive' && <ArchiveView onOpen={openItem} />}
        {route.view === 'backup' && <BackupView />}
      </main>

      <button className="fab" onClick={() => startNew({})} aria-label="תוכן חדש">＋</button>

      {newPreset && (
        <NewItemDialog preset={newPreset} onClose={() => setNewPreset(null)}
          onCreated={(id) => { setNewPreset(null); openItem(id); }} />
      )}
      {route.open && <Editor key={route.open} id={route.open} onClose={closeItem} />}
      {showPassword && <SetPassword onDone={() => setShowPassword(false)} asDialog />}
      <Toasts />
    </div>
  );
}
