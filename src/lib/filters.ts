import { useEffect, useState } from 'react';
import type { Assignee, ContentItem, Format, Status } from './types';
import { todayISO } from './dates';

export interface Filters {
  assignee: '' | Assignee | 'none';
  format: '' | Format | 'none';
  status: '' | Status;
}
export const EMPTY_FILTERS: Filters = { assignee: '', format: '', status: '' };

const KEY = 'gp:filters';

export function useFilters(): [Filters, (f: Filters) => void] {
  const [f, setF] = useState<Filters>(() => {
    try { return { ...EMPTY_FILTERS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return EMPTY_FILTERS; }
  });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* העדפה מקומית בלבד */ } }, [f]);
  return [f, setF];
}

export function matchesFilters(item: ContentItem, f: Filters): boolean {
  if (f.assignee) {
    if (f.assignee === 'none') { if (item.assignee) return false; }
    else if (f.assignee === 'both') { if (item.assignee !== 'both') return false; }
    // סינון לפי לירן או אלה כולל גם תכנים ששניהם אחראים עליהם
    else if (item.assignee !== f.assignee && item.assignee !== 'both') return false;
  }
  if (f.format) {
    if (f.format === 'none') { if (item.format) return false; }
    else if (item.format !== f.format) return false;
  }
  if (f.status && item.status !== f.status) return false;
  return true;
}

export function isOverdue(item: ContentItem, today = todayISO()): boolean {
  return Boolean(item.planned_date && item.planned_date < today && item.status !== 'published' && !item.archived_at);
}

export function itemSearchText(item: ContentItem): string {
  return [
    item.title, item.series, item.brief, item.post_copy,
    ...item.slides.flatMap((s) => [s.title, s.text, s.caption]),
    ...item.source_links.flatMap((l) => [l.label, l.url]),
  ].filter(Boolean).join(' \n ').toLowerCase();
}
