// בדיקות הרשאות ונתונים מול Supabase אמיתי (מקומי או מרוחק) — לא מול הדמיה.
// הרצה: SB_URL=... SB_ANON=... LIRAN_EMAIL=... LIRAN_PASSWORD=... ELLA_EMAIL=... ELLA_PASSWORD=...
//        [INTRUDER_EMAIL=... INTRUDER_PASSWORD=...] node --test tests/security.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const { SB_URL, SB_ANON } = process.env;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(SB_URL, SB_ANON, opts);

async function login(email, password) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

const liran = await login(process.env.LIRAN_EMAIL, process.env.LIRAN_PASSWORD);
const ella = await login(process.env.ELLA_EMAIL, process.env.ELLA_PASSWORD);
const anon = client();
const created = [];

test('אורח לא מחובר לא רואה ולא כותב כלום', async () => {
  const r = await anon.from('content_items').select('*');
  assert.ok(r.error || r.data.length === 0, 'anon must not read items');
  const w = await anon.from('content_items').insert({ title: 'hack' });
  assert.ok(w.error, 'anon insert must fail');
  const m = await anon.from('members').select('*');
  assert.ok(m.error || m.data.length === 0, 'anon must not read members');
  const s = await anon.storage.from('attachments').upload('items/x/y.txt', new Blob(['x'], { type: 'text/plain' }));
  assert.ok(s.error, 'anon upload must fail');
  const rpc = await anon.rpc('restore_backup', { payload: { items: [] } });
  assert.ok(rpc.error, 'anon restore must fail');
});

test('הרשמה ציבורית חסומה', async () => {
  const { data, error } = await anon.auth.signUp({ email: `stranger${Date.now()}@test.local`, password: 'Stranger-123456' });
  assert.ok(error || !data.user, 'signup must be rejected');
});

test('משתמש מחובר שאינו ברשימת ההיתר חסום ברמת מסד הנתונים', { skip: !process.env.INTRUDER_EMAIL }, async () => {
  const intruder = await login(process.env.INTRUDER_EMAIL, process.env.INTRUDER_PASSWORD);
  const seed = await liran.from('content_items').insert({ title: 'סודי' }).select().single();
  assert.ifError(seed.error); created.push(seed.data.id);
  const r = await intruder.from('content_items').select('*');
  assert.equal(r.data?.length ?? 0, 0, 'intruder must see nothing');
  const w = await intruder.from('content_items').insert({ title: 'hack' });
  assert.ok(w.error, 'intruder insert must fail');
  const u = await intruder.from('content_items').update({ title: 'hacked' }).eq('id', seed.data.id).select();
  assert.equal(u.data?.length ?? 0, 0, 'intruder update must affect nothing');
  const m = await intruder.from('members').select('*');
  assert.equal(m.data?.length ?? 0, 0);
  const s = await intruder.storage.from('attachments').upload(`items/${seed.data.id}/x.txt`, new Blob(['x'], { type: 'text/plain' }));
  assert.ok(s.error, 'intruder upload must fail');
  const rpc = await intruder.rpc('restore_backup', { payload: { items: [] } });
  assert.ok(rpc.error, 'intruder restore must fail');
  const c = await intruder.from('comments').insert({ item_id: seed.data.id, body: 'x' });
  assert.ok(c.error, 'intruder comment must fail');
  const after = await liran.from('content_items').select('title').eq('id', seed.data.id).single();
  assert.equal(after.data.title, 'סודי');
});

test('לירן יוצר, אלה רואה ועורכת; השרת קובע גרסה ומחבר', async () => {
  const { data: it, error } = await liran.from('content_items').insert({ title: 'Doctor Who · עונה חדשה', version: 99 }).select().single();
  assert.ifError(error); created.push(it.id);
  assert.equal(it.version, 1, 'version is server-controlled');
  assert.equal(it.status, 'idea');
  assert.equal(it.planned_date, null);
  const seen = await ella.from('content_items').select('*').eq('id', it.id).single();
  assert.equal(seen.data.title, 'Doctor Who · עונה חדשה');
  const upd = await ella.from('content_items').update({ planned_date: '2026-12-03', status: 'gathering' }).eq('id', it.id).eq('version', 1).select();
  assert.equal(upd.data.length, 1);
  assert.equal(upd.data[0].version, 2);
  const ellaId = (await ella.auth.getUser()).data.user.id;
  assert.equal(upd.data[0].updated_by, ellaId);
});

test('עדכון עם גרסה ישנה לא דורס (מניעת דריסה שקטה)', async () => {
  const { data: it } = await liran.from('content_items').insert({ title: 'מקבילי' }).select().single();
  created.push(it.id);
  const a = await liran.from('content_items').update({ brief: 'של לירן' }).eq('id', it.id).eq('version', 1).select();
  assert.equal(a.data.length, 1);
  const b = await ella.from('content_items').update({ brief: 'של אלה' }).eq('id', it.id).eq('version', 1).select();
  assert.equal(b.data.length, 0, 'stale update must not apply');
  const cur = await ella.from('content_items').select('brief,version').eq('id', it.id).single();
  assert.equal(cur.data.brief, 'של לירן');
  assert.equal(cur.data.version, 2);
});

test('מחיקה לצמיתות אפשרית רק אחרי ארכוב', async () => {
  const { data: it } = await liran.from('content_items').insert({ title: 'למחיקה' }).select().single();
  const d1 = await liran.from('content_items').delete({ count: 'exact' }).eq('id', it.id);
  assert.equal(d1.count, 0, 'cannot delete non-archived');
  await liran.from('content_items').update({ archived_at: new Date().toISOString() }).eq('id', it.id);
  const d2 = await liran.from('content_items').delete({ count: 'exact' }).eq('id', it.id);
  assert.equal(d2.count, 1);
});

test('תגובה נרשמת בשם הכותב האמיתי, גם אם מנסים לזייף', async () => {
  const id = created[created.length - 1];
  const liranId = (await liran.auth.getUser()).data.user.id;
  const { data, error } = await ella.from('comments').insert({ item_id: id, body: 'נראה מעולה', author_id: liranId, author_name: 'לירן' }).select().single();
  assert.ifError(error);
  assert.equal(data.author_name, 'אלה');
  assert.notEqual(data.author_id, liranId);
  const del = await liran.from('comments').delete({ count: 'exact' }).eq('id', data.id);
  assert.equal(del.count, 0, 'cannot delete someone else\'s comment');
});

test('קבצים: העלאה ע"י לירן, פתיחה ע"י אלה, חסימת גודל/סוג, ללא גישה ציבורית', async () => {
  const id = created[created.length - 1];
  const path = `items/${id}/${crypto.randomUUID()}.png`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await liran.storage.from('attachments').upload(path, new Blob([png], { type: 'image/png' }), { contentType: 'image/png' });
  assert.ifError(up.error);
  const meta = await liran.from('attachments').insert({ item_id: id, storage_path: path, file_name: 'תמונה.png', mime_type: 'image/png', size_bytes: png.length }).select().single();
  assert.ifError(meta.error);
  const dl = await ella.storage.from('attachments').download(path);
  assert.ifError(dl.error);
  assert.equal((await dl.data.arrayBuffer()).byteLength, png.length);
  // הדלי פרטי: כתובת "ציבורית" לא מחזירה את הקובץ
  const pub = liran.storage.from('attachments').getPublicUrl(path).data.publicUrl;
  const res = await fetch(pub);
  assert.notEqual(res.status, 200, 'public URL must not serve file');
  const anonDl = await anon.storage.from('attachments').download(path);
  assert.ok(anonDl.error, 'anon download must fail');
  // סוג לא מורשה
  const bad = await liran.storage.from('attachments').upload(`items/${id}/x.exe`, new Blob(['MZ'], { type: 'application/x-msdownload' }), { contentType: 'application/x-msdownload' });
  assert.ok(bad.error, 'disallowed mime must fail');
  // גודל מעל 25MB
  const big = await liran.storage.from('attachments').upload(`items/${id}/big.txt`, new Blob([new Uint8Array(26 * 1024 * 1024)], { type: 'text/plain' }), { contentType: 'text/plain' });
  assert.ok(big.error, 'file over 25MB must fail');
});

test('שחזור גיבוי: אטומי ומוגבל למורשים', async () => {
  const id = crypto.randomUUID();
  const bad = await liran.rpc('restore_backup', { payload: { items: [{ id, title: 'תקין' }, { id: crypto.randomUUID(), title: '' }] } });
  assert.ok(bad.error, 'invalid row must fail whole restore');
  const none = await liran.from('content_items').select('id').eq('id', id);
  assert.equal(none.data.length, 0, 'nothing restored on failure');
  const ok = await liran.rpc('restore_backup', { payload: { items: [{ id, title: 'שוחזר', status: 'review', created_at: '2026-01-01T10:00:00Z' }] } });
  assert.ifError(ok.error);
  const row = await ella.from('content_items').select('*').eq('id', id).single();
  assert.equal(row.data.status, 'review');
  assert.equal(row.data.created_at.slice(0, 10), '2026-01-01');
  await liran.from('content_items').update({ archived_at: new Date().toISOString() }).eq('id', id);
  await liran.from('content_items').delete().eq('id', id);
});

test('עדכונים בזמן אמת מגיעים לאלה ולא למשתמש לא מורשה', { skip: !process.env.INTRUDER_EMAIL }, async () => {
  const intruder = await login(process.env.INTRUDER_EMAIL, process.env.INTRUDER_PASSWORD);
  const got = { ella: 0, intruder: 0 };
  const intruderPayloads = [];
  const sub = (c, who) => new Promise((res, rej) => {
    setTimeout(() => rej(new Error('subscribe timeout ' + who)), 10000);
    c.channel('t-' + who).on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, (p) => { got[who]++; if (who === 'intruder') intruderPayloads.push(p); })
      .subscribe((st) => { if (st === 'SUBSCRIBED') res(); });
  });
  await Promise.all([sub(ella, 'ella'), sub(intruder, 'intruder')]);
  await new Promise((r) => setTimeout(r, 1000));
  const { data } = await liran.from('content_items').insert({ title: 'בדיקת זמן אמת' }).select().single();
  created.push(data.id);
  await new Promise((r) => setTimeout(r, 3000));
  assert.ok(got.ella >= 1, 'ella should receive realtime event');
  // משתמש לא מורשה לא מקבל תוכן: לכל היותר אירוע ריק עם שגיאת הרשאה
  for (const p of intruderPayloads) {
    assert.deepEqual(p.new, {}, 'no row content may leak');
    assert.ok(Object.keys(p.old).every((k) => k === 'id'), 'only an opaque id may appear (on DELETE)');
  }
  await ella.removeAllChannels(); await intruder.removeAllChannels();
});

test.after(async () => {
  for (const id of created) {
    const att = await liran.from('attachments').select('storage_path').eq('item_id', id);
    if (att.data?.length) await liran.storage.from('attachments').remove(att.data.map((a) => a.storage_path));
    await liran.from('content_items').update({ archived_at: new Date().toISOString() }).eq('id', id);
    await liran.from('content_items').delete().eq('id', id);
  }
});
