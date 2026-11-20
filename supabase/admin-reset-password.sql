-- איפוס סיסמה ידני ע"י לירן (למשל אם אלה שכחה סיסמה ומייל האיפוס לא הגיע).
-- מריצים ב-SQL Editor של Supabase. בוחרים סיסמה זמנית, מוסרים אותה בעל-פה,
-- ואחרי הכניסה משנים אותה בתפריט המשתמש ← "שינוי סיסמה".
update auth.users
set encrypted_password = extensions.crypt('סיסמה-זמנית-כאן', extensions.gen_salt('bf'))
where email = 'ella-email@example.com';
