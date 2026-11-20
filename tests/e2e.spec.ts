import { test, expect, type Browser, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

// סביבת בדיקה בלבד: הנתונים כאן הם נתוני דוגמה ונמחקים בתחילת כל הרצה.
const PW = process.env.TEST_PASSWORD || 'Test-pass-123';
const USERS = { liran: 'liran@test.local', ella: 'ella@test.local', intruder: 'intruder@test.local' };
const PGURL = process.env.PGURL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function sql(q: string) { return execSync(`psql "${PGURL}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim(); }

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n: number) => iso(new Date(now.getFullYear(), now.getMonth(), n));

async function login(browser: Browser, who: keyof typeof USERS, opts: { mobile?: boolean } = {}) {
  const ctx = await browser.newContext(opts.mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'he-IL' }
    : { viewport: { width: 1360, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('אימייל').fill(USERS[who]);
  await page.getByLabel('סיסמה').fill(PW);
  await page.getByRole('button', { name: 'כניסה' }).click();
  return page;
}

async function createViaButton(page: Page, title: string, date?: string) {
  await page.getByRole('button', { name: /תוכן חדש/ }).first().click();
  await page.getByLabel(/נושא או שם עבודה/).fill(title);
  if (date !== undefined) await page.getByRole('dialog').getByLabel('תאריך מתוכנן').fill(date);
  await page.getByRole('button', { name: 'יצירה ופתיחת הכרטיס' }).click();
  await expect(page.locator('.editor')).toBeVisible();
}

const editor = (p: Page) => p.locator('.editor');
const saved = (p: Page) => expect(p.locator('.save-indicator')).toContainText(/נשמר|כל השינויים שמורים/, { timeout: 15_000 });


test('כניסה: שני משתמשים מורשים נכנסים, משתמש לא מורשה וסיסמה שגויה נחסמים', async ({ browser }) => {
  const liran = await login(browser, 'liran');
  await expect(liran.getByRole('button', { name: 'חזרה לחודש הנוכחי' })).toBeVisible();
  const ella = await login(browser, 'ella');
  await expect(ella.getByRole('button', { name: 'חזרה לחודש הנוכחי' })).toBeVisible();
  const intruder = await login(browser, 'intruder');
  await expect(intruder.getByRole('heading', { name: 'אין גישה' })).toBeVisible();
  await expect(intruder.locator('.calendar')).toHaveCount(0);

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByLabel('אימייל').fill(USERS.liran);
  await p.getByLabel('סיסמה').fill('wrong-password');
  await p.getByRole('button', { name: 'כניסה' }).click();
  await expect(p.getByRole('alert')).toHaveText('האימייל או הסיסמה שגויים.');
});

test('יצירה מיום בלוח, עריכה, שקפים, שמירה אחרי רענון ויציאה-כניסה', async ({ browser }) => {
  const p = await login(browser, 'liran');
  await p.getByRole('button', { name: new RegExp(`תוכן חדש ב.*${now.getDate() === 10 ? 11 : 10} ב`) }).click();
  await p.getByLabel(/נושא או שם עבודה/).fill('מדריך: כל סרטי Alien לפי הסדר');
  await p.getByRole('button', { name: 'יצירה ופתיחת הכרטיס' }).click();
  const e = editor(p);
  await e.getByLabel('פורמט').selectOption('carousel');
  await e.getByLabel('אחראי').selectOption('ella');
  await e.getByLabel('סטטוס').selectOption('gathering');
  await e.getByLabel('סדרת תוכן').fill('מדריכי צפייה');
  await e.getByLabel('זווית התוכן / בריף').fill('סדר הצפייה הכרונולוגי מול סדר היציאה. Prometheus first?');
  await e.getByLabel('קופי לפוסט').fill('איך צופים ב-Alien? 👽');
  await e.getByRole('button', { name: '＋ הוספת שקף' }).click();
  await e.getByLabel('כותרת שקף 1').fill('שקף א');
  await e.getByRole('button', { name: '＋ הוספת שקף' }).click();
  await e.getByLabel('כותרת שקף 2').fill('שקף ב');
  await e.getByRole('button', { name: '＋ קאפשן נפרד לשקף' }).first().click();
  await e.getByLabel('קאפשן לשקף 1 (בנוסף לקופי הכללי)').fill('קאפשן לשקף הראשון');
  await e.getByRole('button', { name: 'הזזת שקף 2 למעלה' }).click();
  await expect(e.getByLabel('כותרת שקף 1')).toHaveValue('שקף ב');
  await e.getByRole('button', { name: '＋ הוספת קישור' }).click();
  await e.getByLabel('כתובת קישור 1').fill('https://en.wikipedia.org/wiki/Alien_(franchise)');
  await e.getByLabel('תיאור קישור 1').fill('ויקיפדיה');
  await e.getByLabel('שעה (לא חובה)').fill('19:30');
  await saved(p);
  // רענון
  await p.reload();
  const card = p.locator('.calendar .card', { hasText: 'מדריך: כל סרטי Alien' });
  await expect(card).toContainText('איסוף חומרים');
  await expect(card).toContainText('קרוסלה');
  await expect(card).toContainText('אלה');
  // אחרי רענון הכרטיס נשאר פתוח (הקישור כולל אותו) — סוגרים ויוצאים
  await expect(editor(p).getByLabel('כותרת שקף 1')).toHaveValue('שקף ב');
  await p.keyboard.press('Escape');
  await p.locator('.usermenu summary').click();
  await p.getByRole('button', { name: 'יציאה' }).click();
  await p.getByLabel('אימייל').fill(USERS.liran);
  await p.getByLabel('סיסמה').fill(PW);
  await p.getByRole('button', { name: 'כניסה' }).click();
  await p.locator('.calendar .card', { hasText: 'מדריך: כל סרטי Alien' }).getByRole('button').click();
  await expect(editor(p).getByLabel('כותרת שקף 1')).toHaveValue('שקף ב');
  await expect(editor(p).getByLabel('כותרת שקף 2')).toHaveValue('שקף א');
  await expect(editor(p).getByLabel(/קאפשן לשקף 2/)).toHaveValue('קאפשן לשקף הראשון');
  await expect(editor(p).getByLabel('שעה (לא חובה)')).toHaveValue('19:30');
  await expect(editor(p).getByLabel('קופי לפוסט')).toHaveValue('איך צופים ב-Alien? 👽');
});

test('שינוי תאריך: גרירה במחשב ובחירת תאריך במקלדת', async ({ browser }) => {
  const p = await login(browser, 'liran');
  const src = p.locator('.calendar .card', { hasText: 'מדריך: כל סרטי Alien' });
  const target = p.getByRole('gridcell', { name: new RegExp(`${now.getDate() === 20 ? 21 : 20} ב`) }).first();
  await src.dragTo(target);
  await expect(target.locator('.card', { hasText: 'מדריך: כל סרטי Alien' })).toBeVisible();
  await expect.poll(() => sql("select planned_date from content_items where title like 'מדריך: כל סרטי Alien%'")).toBe(day(now.getDate() === 20 ? 21 : 20));

  // מקלדת בלבד: Tab לכרטיס, Enter, שינוי תאריך בשדה
  await target.locator('.card-main').first().focus();
  await p.keyboard.press('Enter');
  const dateField = editor(p).getByLabel('תאריך מתוכנן');
  await dateField.focus();
  await dateField.fill(day(now.getDate() === 22 ? 23 : 22));
  await saved(p);
  await p.keyboard.press('Escape');
  await expect(p.locator('.editor')).toHaveCount(0);
  await expect.poll(() => sql("select planned_date from content_items where title like 'מדריך: כל סרטי Alien%'")).toBe(day(now.getDate() === 22 ? 23 : 22));
});

test('עדכון של לירן מופיע אצל אלה בלי רענון', async ({ browser }) => {
  const ella = await login(browser, 'ella');
  await expect(ella.locator('.calendar')).toBeVisible();
  const liran = await login(browser, 'liran');
  await createViaButton(liran, 'הקרוסלה על Dune', day(now.getDate() === 15 ? 16 : 15));
  await saved(liran);
  await expect(ella.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' })).toBeVisible({ timeout: 15_000 });
  await editor(liran).getByLabel('סטטוס').selectOption('design');
  await saved(liran);
  await expect(ella.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' })).toContainText('בעיצוב', { timeout: 15_000 });
});

test('עריכה מקבילה: אין דריסה שקטה והטקסט שנכתב לא הולך לאיבוד', async ({ browser }) => {
  const liran = await login(browser, 'liran');
  const ella = await login(browser, 'ella');
  for (const p of [liran, ella]) await p.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' }).getByRole('button').click();
  // לירן מתחיל לכתוב כשהחיבור שלו נופל (כך שהשינוי של אלה לא מגיע אליו בזמן)
  await liran.context().setOffline(true);
  await editor(liran).getByLabel('זווית התוכן / בריף').fill('הבריף של לירן');
  await expect(liran.locator('.save-indicator')).toContainText('לא נשמר', { timeout: 15_000 });
  // בינתיים אלה כותבת באותו שדה ושומרת
  await editor(ella).getByLabel('זווית התוכן / בריף').fill('הבריף של אלה');
  await saved(ella);
  await liran.context().setOffline(false);
  await expect(editor(liran).getByRole('alert').filter({ hasText: 'שינה/תה את הכרטיס בזמן שערכת' })).toBeVisible({ timeout: 15_000 });
  // בשרת עדיין הגרסה של אלה — לא נדרסה
  expect(sql("select brief from content_items where title = 'הקרוסלה על Dune'")).toBe('הבריף של אלה');
  await editor(liran).getByRole('button', { name: 'רענון הכרטיס — בלי לאבד את מה שכתבתי' }).click();
  await expect(editor(liran).getByLabel('זווית התוכן / בריף')).toHaveValue('הבריף של אלה');
  await expect(editor(liran).locator('.mine-box')).toContainText('הבריף של לירן');
  await editor(liran).getByRole('button', { name: 'להחזיר את הגרסה שלי' }).click();
  await saved(liran);
  expect(sql("select brief from content_items where title = 'הקרוסלה על Dune'")).toBe('הבריף של לירן');
  // אצל אלה (בלי שינויים מקומיים) הכרטיס מתעדכן ומוצגת הודעה
  await expect(editor(ella).getByLabel('זווית התוכן / בריף')).toHaveValue('הבריף של לירן', { timeout: 15_000 });
  await expect(editor(ella).locator('.banner.info')).toContainText('עדכן/ה את הכרטיס');
});

test('שדות שונים במקביל משתלבים בלי אובדן', async ({ browser }) => {
  const liran = await login(browser, 'liran');
  const ella = await login(browser, 'ella');
  for (const p of [liran, ella]) await p.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' }).getByRole('button').click();
  await liran.context().setOffline(true);
  await editor(liran).getByLabel('סדרת תוכן').fill('סדרת לירן');
  await expect(liran.locator('.save-indicator')).toContainText('לא נשמר', { timeout: 15_000 });
  await editor(ella).getByLabel('קופי לפוסט').fill('קופי של אלה');
  await saved(ella);
  await liran.context().setOffline(false);
  await expect(editor(liran).getByRole('button', { name: /רענון הכרטיס/ })).toBeVisible({ timeout: 15_000 });
  await editor(liran).getByRole('button', { name: /רענון הכרטיס/ }).click();
  await saved(liran);
  expect(sql("select post_copy || '|' || series from content_items where title = 'הקרוסלה על Dune'")).toBe('קופי של אלה|סדרת לירן');
});

test('קובץ שלירן מעלה נפתח אצל אלה', async ({ browser }) => {
  const liran = await login(browser, 'liran');
  await liran.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' }).getByRole('button').click();
  await expect(editor(liran)).toContainText('עד 25MB לקובץ');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await editor(liran).locator('input[type=file]').setInputFiles({ name: 'פוסטר-דיונה.png', mimeType: 'image/png', buffer: png });
  await expect(editor(liran).locator('.file-list')).toContainText('פוסטר-דיונה.png');
  // קובץ לא נתמך — נחסם עוד לפני העלאה, עם הודעה בעברית
  await editor(liran).locator('input[type=file]').setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await expect(liran.locator('.toast.error')).toContainText('סוג הקובץ אינו נתמך');

  const ella = await login(browser, 'ella');
  await ella.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' }).getByRole('button').click();
  await expect(editor(ella).locator('.file-list')).toContainText('פוסטר-דיונה.png');
  await expect(editor(ella).locator('img.thumb')).toHaveJSProperty('naturalWidth', 1);
  const dl = ella.waitForEvent('download');
  await editor(ella).getByRole('button', { name: 'הורדת פוסטר-דיונה.png' }).click();
  const file = await dl;
  expect(fs.readFileSync(await file.path()).equals(png)).toBe(true);
});

test('בנק רעיונות: רעיון עם נושא בלבד, חיפוש, שיבוץ, החזרה לבנק בלי לאבד קבצים', async ({ browser }) => {
  const p = await login(browser, 'liran');
  await p.getByRole('link', { name: 'בנק רעיונות' }).click();
  await createViaButton(p, 'רעיון: דמויות נשכחות ממארוול');
  await editor(p).getByLabel('זווית התוכן / בריף').fill('Squirrel Girl ו-Moon Knight');
  await saved(p);
  await p.keyboard.press('Escape');
  await createViaButton(p, 'רעיון: מפת הארץ התיכונה');
  await p.keyboard.press('Escape');
  await expect(p.locator('.grid-cards .card')).toHaveCount(2);
  await p.getByPlaceholder(/חיפוש/).fill('moon knight');
  await expect(p.locator('.grid-cards .card')).toHaveCount(1);
  await expect(p.locator('.grid-cards .card')).toContainText('דמויות נשכחות');
  await p.getByPlaceholder(/חיפוש/).fill('');

  // הקרוסלה עם הקובץ: החזרה לבנק ואז שיבוץ מחדש — הקובץ וההערות נשמרים
  await p.getByRole('link', { name: 'לוח חודשי' }).click();
  await p.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' }).getByRole('button').click();
  await editor(p).getByPlaceholder('כתבו הערה…').fill('צריך לבדוק זכויות על התמונה');
  await editor(p).getByRole('button', { name: 'שליחת הערה' }).click();
  await expect(editor(p).locator('.comment')).toContainText('לירן');
  await editor(p).getByRole('button', { name: 'החזרה לבנק הרעיונות (הסרת התאריך)' }).click();
  await saved(p);
  await p.keyboard.press('Escape');
  await expect(p.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' })).toHaveCount(0);
  await p.getByRole('link', { name: 'בנק רעיונות' }).click();
  const c = p.locator('.grid-cards .card', { hasText: 'הקרוסלה על Dune' });
  await c.getByRole('button', { name: 'שיבוץ לתאריך' }).click();
  await c.getByLabel('תאריך לשיבוץ').fill(day(now.getDate() === 12 ? 13 : 12));
  await c.getByRole('button', { name: 'שיבוץ', exact: true }).click();
  await expect(c).toHaveCount(0);
  await p.getByRole('link', { name: 'לוח חודשי' }).click();
  await p.locator('.calendar .card', { hasText: 'הקרוסלה על Dune' }).getByRole('button').click();
  await expect(editor(p).locator('.file-list')).toContainText('פוסטר-דיונה.png');
  await expect(editor(p).locator('.comment')).toContainText('צריך לבדוק זכויות');
  await expect(editor(p).getByLabel('זווית התוכן / בריף')).toHaveValue('הבריף של לירן');
});

test('סינון, סימון באיחור בלי הזזה, ארכוב ושחזור', async ({ browser }) => {
  sql(`insert into content_items (title, planned_date, status, assignee, format) values ('ישן שלא פורסם', '${iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2))}', 'design', 'liran', 'reel')`);
  const p = await login(browser, 'liran');
  await p.goto(`/#/list/${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  if (now.getDate() > 2) {
    const late = p.locator('.card', { hasText: 'ישן שלא פורסם' });
    await expect(late).toContainText('באיחור');
  }
  await p.getByLabel('פורמט').selectOption('reel');
  await expect(p.locator('.daylist .card')).toHaveCount(now.getDate() > 2 ? 1 : 0);
  await p.getByLabel('פורמט').selectOption('');
  await p.getByLabel('אחראי').selectOption('ella');
  await expect(p.locator('.daylist .card', { hasText: 'ישן שלא פורסם' })).toHaveCount(0);
  await expect(p.locator('.daylist .card', { hasText: 'Alien' })).toHaveCount(1);
  await p.getByLabel('אחראי').selectOption('');
  await p.getByLabel('סטטוס').selectOption('gathering');
  await expect(p.locator('.daylist .card')).toHaveCount(1);
  await p.getByRole('button', { name: 'ניקוי סינון' }).click();
  // התאריך לא הוזז אוטומטית
  expect(sql("select planned_date < current_date from content_items where title = 'ישן שלא פורסם'")).toBe('t');

  // ארכוב עם אישור ושחזור
  await p.goto('/#/calendar');
  await p.locator('.card', { hasText: 'ישן שלא פורסם' }).getByRole('button').first().click();
  await editor(p).getByRole('button', { name: 'העברה לארכיון' }).click();
  await p.getByRole('dialog', { name: 'להעביר לארכיון?' }).getByRole('button', { name: 'העברה לארכיון' }).click();
  await expect(p.locator('.toast')).toContainText('הועבר לארכיון');
  await expect(p.locator('.card', { hasText: 'ישן שלא פורסם' })).toHaveCount(0);
  await p.getByRole('link', { name: 'ארכיון' }).click();
  await p.locator('.archive-row', { hasText: 'ישן שלא פורסם' }).getByRole('button', { name: 'שחזור' }).click();
  await expect(p.locator('.archive-row')).toHaveCount(0);
  expect(sql("select archived_at is null from content_items where title = 'ישן שלא פורסם'")).toBe('t');
  // מחיקה לצמיתות דורשת ארכוב + אישור
  sql("update content_items set archived_at = now() where title = 'ישן שלא פורסם'");
  await p.reload();
  await p.locator('.archive-row', { hasText: 'ישן שלא פורסם' }).getByRole('button', { name: 'מחיקה לצמיתות' }).click();
  await expect(p.getByRole('dialog')).toContainText('אי אפשר לבטל');
  await p.getByRole('dialog').getByRole('button', { name: 'ביטול' }).click();
  expect(sql("select count(*) from content_items where title = 'ישן שלא פורסם'")).toBe('1');
  await p.locator('.archive-row', { hasText: 'ישן שלא פורסם' }).getByRole('button', { name: 'מחיקה לצמיתות' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'מחיקה לצמיתות' }).click();
  await expect(p.locator('.archive-row')).toHaveCount(0);
  expect(sql("select count(*) from content_items where title = 'ישן שלא פורסם'")).toBe('0');
});

test('כשל רשת: הטקסט לא אובד, מוצגת שגיאה בעברית, ונשמר כשהרשת חוזרת', async ({ browser }) => {
  const p = await login(browser, 'ella');
  await p.locator('.calendar .card', { hasText: 'מדריך: כל סרטי Alien' }).getByRole('button').click();
  await saved(p);
  await p.context().setOffline(true);
  await editor(p).getByLabel('קופי לפוסט').fill('נכתב בלי אינטרנט');
  await expect(p.locator('.save-indicator')).toContainText('לא נשמר', { timeout: 15_000 });
  await expect(p.locator('.save-indicator')).not.toContainText(/fetch/i);
  await expect(p.locator('.banner.warn')).toContainText('אין חיבור לאינטרנט');
  const stored = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('gp:draft:')).map((k) => localStorage.getItem(k)).join());
  expect(stored).toContain('נכתב בלי אינטרנט');
  expect(sql("select post_copy from content_items where title like 'מדריך: כל סרטי Alien%'")).not.toBe('נכתב בלי אינטרנט');
  await p.context().setOffline(false);
  await saved(p);
  await expect.poll(() => sql("select post_copy from content_items where title like 'מדריך: כל סרטי Alien%'")).toBe('נכתב בלי אינטרנט');

  // טיוטה שנשארה במכשיר משוחזרת אחרי סגירת הדפדפן: חוסמים רק את בקשות השמירה לשרת
  await p.route('**/rest/v1/content_items**', (r) => (r.request().method() === 'PATCH' ? r.abort('internetdisconnected') : r.continue()));
  await editor(p).getByLabel('קופי לפוסט').fill('טיוטה שלא נשלחה');
  await expect(p.locator('.save-indicator')).toContainText('אין חיבור לשרת', { timeout: 15_000 });
  await p.unroute('**/rest/v1/content_items**');
  await p.reload(); // סגירה לפני שהשמירה האוטומטית ניסתה שוב — הכרטיס נפתח מחדש מהקישור
  await expect(editor(p).locator('.banner.info')).toContainText('שוחזרו שינויים שלא נשמרו');
  await saved(p);
  await expect(editor(p).getByLabel('קופי לפוסט')).toHaveValue('טיוטה שלא נשלחה');
  await expect.poll(() => sql("select post_copy from content_items where title like 'מדריך: כל סרטי Alien%'")).toBe('טיוטה שלא נשלחה');
});

test('מובייל: תצוגת רשימה, כפתור תוכן חדש צף, ועריכה', async ({ browser }) => {
  const p = await login(browser, 'ella', { mobile: true });
  await expect(p.getByRole('link', { name: 'רשימה' })).toHaveAttribute('aria-current', 'page');
  await expect(p.locator('.daylist')).toContainText('Alien');
  await p.locator('.fab').click();
  await p.getByLabel(/נושא או שם עבודה/).fill('סטורי: סקר גיבורי על');
  await p.getByRole('dialog').getByLabel('תאריך מתוכנן').fill(day(now.getDate() === 26 ? 27 : 26));
  await p.getByRole('button', { name: 'יצירה ופתיחת הכרטיס' }).click();
  await editor(p).getByLabel('פורמט').selectOption('story');
  await saved(p);
  const box = await editor(p).boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('ניווט במקלדת בלבד: יצירת תוכן חדש ומעבר בין חודשים', async ({ browser }) => {
  const p = await login(browser, 'liran');
  await expect(p.locator('.calendar')).toBeVisible();
  await p.keyboard.press('Tab'); // דילוג לתוכן
  await expect(p.getByRole('link', { name: 'דילוג לתוכן' })).toBeFocused();
  let found = false;
  for (let i = 0; i < 15 && !found; i++) {
    await p.keyboard.press('Tab');
    found = await p.evaluate(() => document.activeElement?.textContent?.includes('תוכן חדש') ?? false);
  }
  expect(found).toBe(true);
  await p.keyboard.press('Enter');
  await p.keyboard.type('נוצר במקלדת');
  await p.keyboard.press('Enter');
  await expect(editor(p)).toBeVisible();
  await saved(p);
  await p.keyboard.press('Escape');
  await p.getByRole('link', { name: 'בנק רעיונות' }).focus();
  await p.keyboard.press('Enter');
  await expect(p.locator('.grid-cards')).toContainText('נוצר במקלדת');
  await p.getByRole('link', { name: 'לוח חודשי' }).focus();
  await p.keyboard.press('Enter');
  const title = await p.locator('.month-title').innerText();
  await p.getByRole('button', { name: 'לחודש הבא' }).focus();
  await p.keyboard.press('Enter');
  await expect(p.locator('.month-title')).not.toHaveText(title);
  // חודש חדש ריק — לא הועתק אליו תוכן
  await expect(p.locator('.cal-cell:not(.out) .card')).toHaveCount(0);
  await p.getByRole('button', { name: 'חזרה לחודש הנוכחי' }).focus();
  await p.keyboard.press('Enter');
  await expect(p.locator('.month-title')).toHaveText(title);
  await expect(p.locator('.calendar .card', { hasText: 'Alien' })).toHaveCount(1);
});

test('RTL: כיוון המסמך עברי וטקסט באנגלית בשדה נשאר תקין', async ({ browser }) => {
  const p = await login(browser, 'liran');
  expect(await p.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await p.locator('.calendar .card', { hasText: 'Alien' }).getByRole('button').click();
  const t = editor(p).getByLabel('זווית התוכן / בריף');
  await expect(t).toHaveAttribute('dir', 'auto');
  await t.fill('The Mandalorian — עונה 4');
  await saved(p);
  await expect(t).toHaveValue('The Mandalorian — עונה 4');
});
