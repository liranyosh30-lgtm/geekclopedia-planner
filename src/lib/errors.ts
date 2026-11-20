/** תרגום שגיאות טכניות להודעות בעברית. אף פעם לא מציגים למשתמש "Failed to fetch". */
export function hebrewError(err: unknown): string {
  if (!err) return 'משהו השתבש. נסו שוב.';
  const e = err as { message?: string; code?: string; status?: number; statusCode?: string | number; error?: string };
  const msg = String(e.message ?? e.error ?? err);
  const code = String(e.code ?? '');
  const status = Number(e.status ?? e.statusCode ?? 0);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'אין חיבור לאינטרנט. מה שכתבתם שמור במכשיר הזה, ונשמור לשרת כשהחיבור יחזור.';
  }
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed|err_network|timeout|aborted/i.test(msg)) {
    return 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב. מה שכתבתם לא נמחק.';
  }
  if (/invalid login credentials/i.test(msg)) return 'האימייל או הסיסמה שגויים.';
  if (/email not confirmed/i.test(msg)) return 'כתובת האימייל עדיין לא אומתה.';
  if (/password should be at least|weak.?password/i.test(msg)) return 'הסיסמה קצרה או חלשה מדי. בחרו לפחות 8 תווים.';
  if (/same.?password|different from the old/i.test(msg)) return 'הסיסמה החדשה זהה לישנה.';
  if (/rate limit|too many requests/i.test(msg) || status === 429) return 'נשלחו יותר מדי בקשות. המתינו כמה דקות ונסו שוב.';
  if (/jwt expired|invalid jwt|not authenticated|session.*missing|refresh token/i.test(msg) || code === 'PGRST301' || code === 'PGRST303') {
    return 'פג תוקף ההתחברות. התחברו מחדש — הטקסט שכתבתם שמור במכשיר.';
  }
  if (code === '42501' || /row-level security|permission denied|not authorized|unauthorized/i.test(msg) || status === 403) {
    return 'אין הרשאה לפעולה הזו. רק משתמשים מורשים יכולים לצפות ולערוך.';
  }
  if (/payload too large|maximum allowed size|exceeded the maximum|entity too large/i.test(msg) || status === 413) {
    return 'הקובץ גדול מדי. הגודל המרבי הוא 25MB.';
  }
  if (/mime type|invalid_mime|not supported/i.test(msg) || status === 415) return 'סוג הקובץ אינו נתמך.';
  if (/quota|exceed_|restricted|over_.*limit|402/i.test(msg) || status === 402) {
    return 'השירות החינמי הגיע למכסה החודשית ולכן פעולה זו חסומה זמנית. הנתונים הקיימים לא נמחקו — ראו "מגבלות" בהוראות.';
  }
  if (code === '23514') return 'אחד השדות ארוך מדי או לא תקין.';
  if (code === '23503') return 'הכרטיס כבר לא קיים (ייתכן שנמחק במכשיר אחר).';
  if (code === '23505') return 'הפריט כבר קיים.';
  if (status >= 500 || /internal server error|bad gateway|service unavailable/i.test(msg)) {
    return 'השרת לא זמין כרגע (ייתכן שהפרויקט מושהה). נסו שוב בעוד רגע.';
  }
  console.error('Unmapped error', err);
  return 'משהו השתבש ולא נשמר. נסו שוב.';
}

export function isNetworkError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err);
  return (typeof navigator !== 'undefined' && !navigator.onLine) ||
    /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|aborted/i.test(msg);
}
