-- שלב 2 בהקמה: רשימת המשתמשים המורשים.
-- מחליפים את שתי הכתובות בכתובות האמיתיות (באותיות קטנות) ומריצים ב-SQL Editor של Supabase
-- *לפני* שיוצרים את המשתמשים. כתובת שלא מופיעה כאן לא תוכל ליצור משתמש ולא תראה תוכן.
insert into public.members (key, email, display_name) values
  ('liran', 'liran-email@example.com', 'לירן'),
  ('ella',  'ella-email@example.com',  'אלה');

-- אם יצרתם משתמשים לפני השלב הזה, השורה הבאה מקשרת אותם לרשימה:
update public.members m set user_id = u.id
from auth.users u where lower(u.email) = m.email and m.user_id is null;

-- בדיקה: שתי שורות, ובשתיהן linked = true אחרי יצירת המשתמשים
select key, email, user_id is not null as linked from public.members;
