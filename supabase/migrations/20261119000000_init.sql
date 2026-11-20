-- גיקלופדיה · מתכנן תוכן — סכמת מסד הנתונים
-- הקובץ הזה הוא מקור האמת: הוא רץ גם בסביבת הבדיקה המקומית וגם בפרויקט Supabase האמיתי
-- (מדביקים אותו ב-SQL Editor). אפשר להריץ אותו פעם אחת על פרויקט ריק.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- חברי צוות מורשים (רשימת היתר). רק כתובות שמופיעות כאן יכולות ליצור משתמש ולראות תוכן.
-- הטבלה מתמלאת ידנית ב-SQL Editor (ראו docs/SETUP.md) ואין למשתמשי האפליקציה הרשאת כתיבה אליה.
-- ---------------------------------------------------------------------------
create table public.members (
  key          text primary key check (key in ('liran', 'ella')),
  email        text not null unique check (email = lower(btrim(email)) and email like '%@%'),
  display_name text not null check (length(btrim(display_name)) between 1 and 40),
  user_id      uuid unique references auth.users (id) on delete set null
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- חסימת יצירת משתמש שאינו ברשימת ההיתר (גם אם ההרשמה הציבורית תופעל בטעות)
create or replace function public.enforce_member_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from public.members m where m.email = lower(new.email)
  ) then
    raise exception 'email % is not on the members allowlist', coalesce(new.email, '(none)')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.link_member_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members set user_id = new.id where email = lower(new.email);
  return new;
end;
$$;

create trigger enforce_member_allowlist
  before insert on auth.users
  for each row execute function public.enforce_member_allowlist();

create trigger link_member_user
  after insert on auth.users
  for each row execute function public.link_member_user();

-- ---------------------------------------------------------------------------
-- כרטיסי תוכן
-- planned_date ריק = הכרטיס נמצא בבנק הרעיונות.
-- version עולה בכל עדכון; העדכון מהאפליקציה מותנה בגרסה שנטענה, כדי למנוע דריסה שקטה.
-- ---------------------------------------------------------------------------
create type public.content_status as enum
  ('idea', 'gathering', 'design', 'review', 'ready', 'published');

create table public.content_items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 300),
  series        text check (series is null or length(series) <= 120),
  format        text check (format in ('carousel', 'single', 'reel', 'story')),
  assignee      text check (assignee in ('liran', 'ella', 'both')),
  planned_date  date,
  planned_time  time,
  status        public.content_status not null default 'idea',
  brief         text not null default '' check (length(brief) <= 20000),
  post_copy     text not null default '' check (length(post_copy) <= 20000),
  slides        jsonb not null default '[]'::jsonb
                check (jsonb_typeof(slides) = 'array' and length(slides::text) <= 200000),
  source_links  jsonb not null default '[]'::jsonb
                check (jsonb_typeof(source_links) = 'array' and length(source_links::text) <= 20000),
  instagram_url text check (instagram_url is null or length(instagram_url) <= 500),
  published_on  date,
  archived_at   timestamptz,
  version       integer not null default 1,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint time_requires_date check (planned_time is null or planned_date is not null)
);

create index content_items_planned_date_idx on public.content_items (planned_date);

create or replace function public.content_items_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  restoring boolean := coalesce(current_setting('app.restoring', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not restoring then
      new.version    := 1;
      new.created_at := now();
      new.updated_at := now();
      new.created_by := auth.uid();
      new.updated_by := auth.uid();
    end if;
  else
    new.version    := old.version + 1;
    if not restoring then
      new.created_at := old.created_at;
      new.created_by := old.created_by;
      new.updated_at := now();
      new.updated_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create trigger content_items_stamp
  before insert or update on public.content_items
  for each row execute function public.content_items_stamp();

-- ---------------------------------------------------------------------------
-- תגובות
-- ---------------------------------------------------------------------------
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.content_items (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_name text not null default '',
  body        text not null check (length(btrim(body)) between 1 and 5000),
  created_at  timestamptz not null default now()
);

create index comments_item_idx on public.comments (item_id, created_at);

create or replace function public.comments_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then
    return new;
  end if;
  new.author_id  := auth.uid();
  new.created_at := now();
  new.author_name := coalesce(
    (select m.display_name from public.members m where m.user_id = auth.uid()), '');
  return new;
end;
$$;

create trigger comments_stamp
  before insert on public.comments
  for each row execute function public.comments_stamp();

-- ---------------------------------------------------------------------------
-- קבצים מצורפים (הקובץ עצמו נשמר ב-Storage, בדלי הפרטי attachments)
-- ---------------------------------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.content_items (id) on delete cascade,
  storage_path text not null unique check (storage_path like 'items/%'),
  file_name    text not null check (length(file_name) between 1 and 255),
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes between 0 and 26214400),
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index attachments_item_idx on public.attachments (item_id);

create or replace function public.attachments_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then
    return new;
  end if;
  new.uploaded_by := auth.uid();
  new.created_at  := now();
  return new;
end;
$$;

create trigger attachments_stamp
  before insert on public.attachments
  for each row execute function public.attachments_stamp();

-- ---------------------------------------------------------------------------
-- הרשאות: אין שום גישה ל-anon. משתמש מחובר מקבל גישה רק אם הוא ברשימת ההיתר.
-- ---------------------------------------------------------------------------
revoke all on table public.members, public.content_items, public.comments, public.attachments
  from anon, public;
grant select on table public.members to authenticated;
grant select, insert, update, delete on table public.content_items, public.comments, public.attachments
  to authenticated;

alter table public.members       enable row level security;
alter table public.content_items enable row level security;
alter table public.comments      enable row level security;
alter table public.attachments   enable row level security;

create policy members_read on public.members
  for select to authenticated using ((select public.is_member()));

create policy items_read   on public.content_items for select to authenticated
  using ((select public.is_member()));
create policy items_insert on public.content_items for insert to authenticated
  with check ((select public.is_member()));
create policy items_update on public.content_items for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy items_delete on public.content_items for delete to authenticated
  using ((select public.is_member()) and archived_at is not null);

create policy comments_read   on public.comments for select to authenticated
  using ((select public.is_member()));
create policy comments_insert on public.comments for insert to authenticated
  with check ((select public.is_member()));
create policy comments_delete on public.comments for delete to authenticated
  using ((select public.is_member()) and author_id = (select auth.uid()));

create policy attachments_read   on public.attachments for select to authenticated
  using ((select public.is_member()));
create policy attachments_insert on public.attachments for insert to authenticated
  with check ((select public.is_member()));
create policy attachments_delete on public.attachments for delete to authenticated
  using ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- אחסון קבצים: דלי פרטי עם מגבלת גודל וסוג שנאכפת בשרת
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf', 'video/mp4', 'video/quicktime', 'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy attachments_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (select public.is_member()));
create policy attachments_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (select public.is_member()));
create policy attachments_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (select public.is_member()))
  with check (bucket_id = 'attachments' and (select public.is_member()));
create policy attachments_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (select public.is_member()));

-- ---------------------------------------------------------------------------
-- שחזור מגיבוי: פעולה אחת אטומית (הכול או כלום), למשתמשים מורשים בלבד.
-- ממזגת לפי מזהה: כרטיס קיים מתעדכן, כרטיס חסר נוצר. לא מוחקת דבר.
-- ---------------------------------------------------------------------------
create or replace function public.restore_backup(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_items int; n_comments int; n_attachments int;
begin
  if not public.is_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform set_config('app.restoring', 'on', true);

  insert into public.content_items as t (
    id, title, series, format, assignee, planned_date, planned_time, status, brief, post_copy,
    slides, source_links, instagram_url, published_on, archived_at, version,
    created_by, created_at, updated_by, updated_at)
  select
    r.id, r.title, r.series, r.format, r.assignee, r.planned_date, r.planned_time,
    coalesce(r.status, 'idea'), coalesce(r.brief, ''), coalesce(r.post_copy, ''),
    coalesce(r.slides, '[]'::jsonb), coalesce(r.source_links, '[]'::jsonb),
    r.instagram_url, r.published_on, r.archived_at, 1,
    r.created_by, coalesce(r.created_at, now()), auth.uid(), now()
  from jsonb_populate_recordset(null::public.content_items, coalesce(payload -> 'items', '[]'::jsonb)) r
  on conflict (id) do update set
    title = excluded.title, series = excluded.series, format = excluded.format,
    assignee = excluded.assignee, planned_date = excluded.planned_date,
    planned_time = excluded.planned_time, status = excluded.status, brief = excluded.brief,
    post_copy = excluded.post_copy, slides = excluded.slides, source_links = excluded.source_links,
    instagram_url = excluded.instagram_url, published_on = excluded.published_on,
    archived_at = excluded.archived_at, updated_by = auth.uid(), updated_at = now();
  get diagnostics n_items = row_count;

  insert into public.comments (id, item_id, author_id, author_name, body, created_at)
  select r.id, r.item_id, r.author_id, coalesce(r.author_name, ''), r.body, coalesce(r.created_at, now())
  from jsonb_populate_recordset(null::public.comments, coalesce(payload -> 'comments', '[]'::jsonb)) r
  on conflict (id) do nothing;
  get diagnostics n_comments = row_count;

  insert into public.attachments (id, item_id, storage_path, file_name, mime_type, size_bytes,
                                  uploaded_by, created_at)
  select r.id, r.item_id, r.storage_path, r.file_name, r.mime_type, r.size_bytes,
         r.uploaded_by, coalesce(r.created_at, now())
  from jsonb_populate_recordset(null::public.attachments, coalesce(payload -> 'attachments', '[]'::jsonb)) r
  on conflict (id) do nothing;
  get diagnostics n_attachments = row_count;

  return jsonb_build_object('items', n_items, 'comments', n_comments, 'attachments', n_attachments);
end;
$$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- עדכונים בזמן אמת בין המכשירים (Realtime מכבד את מדיניות ה-RLS שלמעלה)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.content_items, public.comments, public.attachments;
