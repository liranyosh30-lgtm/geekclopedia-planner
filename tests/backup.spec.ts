import { test, expect, type Browser } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

// ייצוא מסביבה A ושחזור לסביבה B נפרדת לגמרי (מסד נתונים, אחסון ומשתמשים אחרים).
// הרצה: RESTORE_APP_URL=http://127.0.0.1:4174 RESTORE_PGURL=postgresql://... E2E_SKIP_RESET=1 npx playwright test backup
const B_URL = process.env.RESTORE_APP_URL;
const A_PG = process.env.PGURL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const B_PG = process.env.RESTORE_PGURL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const PW = process.env.TEST_PASSWORD || 'Test-pass-123';
const q = (url: string, sql: string) => execSync(`psql "${url}" -At -c "${sql}"`).toString().trim();

async function login(browser: Browser, base: string, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  await p.goto(base + '/');
  await p.getByLabel('אימייל').fill(email);
  await p.getByLabel('סיסמה').fill(PW);
  await p.getByRole('button', { name: 'כניסה' }).click();
  await expect(p.getByRole('link', { name: 'גיבוי' })).toBeVisible();
  return p;
}

test.skip(!B_URL, 'נדרשת סביבת שחזור נפרדת');

test('ייצוא גיבוי מסביבה A ושחזורו בסביבה B נפרדת', async ({ browser, baseURL }) => {
  const summary = (url: string) => q(url,
    "select count(*) || '|' || (select count(*) from comments) || '|' || (select count(*) from attachments) || '|' || coalesce(sum(length(title)+length(brief)+length(post_copy)+length(slides::text)),0) from content_items");
  const before = summary(A_PG);
  expect(Number(before.split('|')[0])).toBeGreaterThan(0);
  expect(Number(before.split('|')[2])).toBeGreaterThan(0);

  // ייצוא
  const a = await login(browser, baseURL!, 'ella@test.local');
  await a.getByRole('link', { name: 'גיבוי' }).click();
  const dlP = a.waitForEvent('download');
  await a.getByRole('button', { name: 'הורדת גיבוי מלא' }).click();
  const dl = await dlP;
  const zipPath = 'tests/.artifacts/backup.zip';
  fs.mkdirSync('tests/.artifacts', { recursive: true });
  await dl.saveAs(zipPath);
  await expect(a.getByRole('status').filter({ hasText: 'הגיבוי הורד' })).toBeVisible();

  // שחזור לסביבה ריקה ונפרדת
  expect(q(B_PG, 'select count(*) from content_items')).toBe('0');
  const b = await login(browser, B_URL!, 'liran@test.local');
  await b.getByRole('link', { name: 'גיבוי' }).click();
  await b.getByLabel('קובץ גיבוי (zip)').setInputFiles(zipPath);
  await expect(b.getByRole('dialog')).toContainText('כרטיסים');
  await b.getByRole('dialog').getByRole('button', { name: 'שחזור' }).click();
  await expect(b.locator('.info-text').filter({ hasText: 'השחזור הושלם' })).toBeVisible({ timeout: 30_000 });

  expect(summary(B_PG)).toBe(before);
  // מזהי המשתמשים מופו לפי אימייל למשתמשים של הסביבה החדשה
  expect(q(B_PG, "select count(*) from comments c join members m on m.user_id = c.author_id")).toBe(q(B_PG, 'select count(*) from comments'));
  // הקובץ המשוחזר נפתח בסביבה החדשה ותוכנו זהה
  const name = q(B_PG, 'select file_name from attachments limit 1');
  const title = q(B_PG, `select i.title from attachments a join content_items i on i.id = a.item_id where a.file_name = '${name}'`);
  const archived = q(B_PG, `select archived_at is not null or planned_date is null from content_items where title = '${title}'`);
  await b.getByRole('link', { name: archived === 't' ? 'בנק רעיונות' : 'לוח חודשי' }).click();
  const planned = q(B_PG, `select coalesce(to_char(planned_date,'YYYY-MM'),'') from content_items where title = '${title}'`);
  if (planned) await b.goto(`${B_URL}/#/list/${planned}`);
  await b.locator('.card', { hasText: title }).getByRole('button').first().click();
  const dl2P = b.waitForEvent('download');
  await b.getByRole('button', { name: `הורדת ${name}` }).click();
  const restored = fs.readFileSync(await (await dl2P).path());
  expect(restored.length).toBe(Number(q(A_PG, `select size_bytes from attachments where file_name = '${name}' limit 1`)));

  // שחזור חוזר הוא בטוח (מיזוג, בלי כפילויות)
  await b.goto(`${B_URL}/#/backup`);
  await b.getByLabel('קובץ גיבוי (zip)').setInputFiles(zipPath);
  await b.getByRole('dialog').getByRole('button', { name: 'שחזור' }).click();
  await expect(b.locator('.info-text').filter({ hasText: 'השחזור הושלם' })).toBeVisible({ timeout: 30_000 });
  expect(summary(B_PG)).toBe(before);
});
