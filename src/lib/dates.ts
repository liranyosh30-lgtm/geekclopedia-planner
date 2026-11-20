export const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const pad = (n: number) => String(n).padStart(2, '0');

/** תאריך מקומי בפורמט YYYY-MM-DD (בלי המרות UTC שמזיזות יום) */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayISO(): string {
  return toISODate(new Date());
}
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function parseMonthKey(k: string | undefined): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(k ?? '');
  if (!m) { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); }
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
export function monthTitle(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** ימי הרשת החודשית — שבוע מתחיל ביום ראשון */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= last || cur.getDay() !== 0) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function formatDateHe(iso: string | null, withWeekday = true): string {
  if (!iso) return '';
  const d = parseISODate(iso);
  const base = `${d.getDate()} ב${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return withWeekday ? `יום ${WEEKDAYS[d.getDay()]}, ${base}` : base;
}
export function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}
export function formatDateTimeHe(ts: string): string {
  const d = new Date(ts);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function formatClock(ts: number | string): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
