import { execSync } from 'node:child_process';

// סביבת בדיקה בלבד: מוחקים נתוני דוגמה מהרצות קודמות פעם אחת לפני כל ההרצה.
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  const PGURL = process.env.PGURL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  execSync(`psql "${PGURL}" -c "delete from public.content_items;"`);
}
