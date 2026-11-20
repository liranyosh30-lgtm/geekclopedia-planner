export type Status = 'idea' | 'gathering' | 'design' | 'review' | 'ready' | 'published';
export type Format = 'carousel' | 'single' | 'reel' | 'story';
export type Assignee = 'liran' | 'ella' | 'both';
export type MemberKey = 'liran' | 'ella';

export interface Slide {
  id: string;
  title: string;
  text: string;
  caption: string;
}

export interface SourceLink {
  id: string;
  url: string;
  label: string;
}

export interface ContentItem {
  id: string;
  title: string;
  series: string | null;
  format: Format | null;
  assignee: Assignee | null;
  planned_date: string | null; // YYYY-MM-DD
  planned_time: string | null; // HH:MM[:SS]
  status: Status;
  brief: string;
  post_copy: string;
  slides: Slide[];
  source_links: SourceLink[];
  instagram_url: string | null;
  published_on: string | null;
  archived_at: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface Member {
  key: MemberKey;
  email: string;
  display_name: string;
  user_id: string | null;
}

export interface Comment {
  id: string;
  item_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  item_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

/** שדות שהמשתמש עורך בכרטיס (כל השאר מנוהלים על ידי השרת) */
export const EDITABLE_FIELDS = [
  'title', 'series', 'format', 'assignee', 'planned_date', 'planned_time', 'status',
  'brief', 'post_copy', 'slides', 'source_links', 'instagram_url', 'published_on',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type EditableValues = Pick<ContentItem, EditableField>;

export const STATUSES: { key: Status; label: string }[] = [
  { key: 'idea', label: 'רעיון' },
  { key: 'gathering', label: 'איסוף חומרים' },
  { key: 'design', label: 'בעיצוב' },
  { key: 'review', label: 'לבדיקה' },
  { key: 'ready', label: 'מוכן לפרסום' },
  { key: 'published', label: 'פורסם' },
];
export const STATUS_LABEL: Record<Status, string> = Object.fromEntries(
  STATUSES.map((s) => [s.key, s.label]),
) as Record<Status, string>;

export const FORMATS: { key: Format; label: string }[] = [
  { key: 'carousel', label: 'קרוסלה' },
  { key: 'single', label: 'פוסט בודד' },
  { key: 'reel', label: 'ריל' },
  { key: 'story', label: 'סטורי' },
];
export const FORMAT_LABEL: Record<Format, string> = Object.fromEntries(
  FORMATS.map((f) => [f.key, f.label]),
) as Record<Format, string>;

export const ASSIGNEES: { key: Assignee; label: string }[] = [
  { key: 'liran', label: 'לירן' },
  { key: 'ella', label: 'אלה' },
  { key: 'both', label: 'שניהם' },
];
export const ASSIGNEE_LABEL: Record<Assignee, string> = { liran: 'לירן', ella: 'אלה', both: 'שניהם' };

export const FIELD_LABEL: Record<EditableField, string> = {
  title: 'נושא / שם עבודה',
  series: 'סדרת תוכן',
  format: 'פורמט',
  assignee: 'אחראי',
  planned_date: 'תאריך מתוכנן',
  planned_time: 'שעה',
  status: 'סטטוס',
  brief: 'זווית התוכן / בריף',
  post_copy: 'קופי לפוסט',
  slides: 'שקפים',
  source_links: 'קישורים לחומרי מקור',
  instagram_url: 'קישור לפרסום באינסטגרם',
  published_on: 'תאריך פרסום בפועל',
};

/** מגבלות קבצים — זהות למגבלות שנאכפות בדלי האחסון בשרת */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;
export const FILE_TYPES: Record<string, string> = {
  'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/gif': 'GIF',
  'image/heic': 'HEIC', 'image/heif': 'HEIF', 'application/pdf': 'PDF',
  'video/mp4': 'MP4', 'video/quicktime': 'MOV', 'text/plain': 'TXT',
};
export const FILE_ACCEPT = Object.keys(FILE_TYPES).join(',') + ',.heic,.heif,.mov';
export const FILE_LIMITS_TEXT = 'עד 25MB לקובץ · תמונות (JPG, PNG, WEBP, GIF, HEIC), PDF, וידאו (MP4, MOV), קובצי טקסט';
