import { useEffect, useState } from 'react';

export type View = 'calendar' | 'list' | 'ideas' | 'archive' | 'backup';
export interface Route { view: View; month?: string; open?: string }

const VIEWS: View[] = ['calendar', 'list', 'ideas', 'archive', 'backup'];

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [v, month] = path.split('/');
  const params = new URLSearchParams(query);
  const defaultView: View = window.matchMedia('(max-width: 720px)').matches ? 'list' : 'calendar';
  const view = (VIEWS as string[]).includes(v) ? (v as View) : defaultView;
  // type=recovery וכו' מגיעים מ-Supabase בהאש — לא מתייחסים אליהם כאל ניתוב
  return { view, month: month || undefined, open: params.get('open') || undefined };
}

export function buildHash(r: Route): string {
  let h = `#/${r.view}`;
  if (r.month && (r.view === 'calendar' || r.view === 'list')) h += `/${r.month}`;
  if (r.open) h += `?open=${r.open}`;
  return h;
}

export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route, replace = false) => {
    const h = buildHash(r);
    if (replace) history.replaceState(null, '', h);
    else history.pushState(null, '', h);
    setRoute(parseHash(h));
  };
  return [route, go];
}
