import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

// מפתח ה-anon/publishable ציבורי מעצם הגדרתו. ההרשאות נאכפות במסד הנתונים (RLS).
export const supabase = createClient(url || 'http://invalid.localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const BUCKET = 'attachments';
