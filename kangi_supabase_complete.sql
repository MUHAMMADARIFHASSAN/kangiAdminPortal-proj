-- ================================================================
--  kangi_supabase_complete.sql
--  Kangi — Complete Supabase Schema (single file, run once)
--
--  HOW TO USE:
--    1. Go to Supabase Dashboard -> SQL Editor -> New Query
--    2. Paste this entire file
--    3. Click Run
--    4. Done — schema, storage, security, functions, seed data
--       and admin user are all created in one shot.
--
--  ADMIN LOGIN AFTER RUNNING:
--    Email:    admin@kangi.com
--    Password: 1234@678
--
--  EXECUTION ORDER (do not change):
--    1.  Tables
--    2.  Extra columns
--    3.  is_admin_user() helper   <- must be after profiles table
--    4.  Storage buckets + policies
--    5.  RLS policies             <- must be after helper function
--    6.  Column-level security
--    7.  Triggers
--    8.  RPC functions
--    9.  Admin dashboard view
--    10. TCG batches table
--    11. Seed data
--    12. Admin user
-- ================================================================


-- ================================================================
-- 1. TABLES
-- ================================================================

-- profiles (extends auth.users)
create table if not exists profiles (
  id            uuid        primary key references auth.users on delete cascade,
  display_name  text,
  avatar_url    text,
  is_admin      bool        not null default false,
  is_banned     bool        not null default false,
  banned_until  timestamptz,
  is_premium    bool        not null default false,
  settings      text        not null default '{}',
  created_at    timestamptz not null default now()
);

-- videos
create table if not exists videos (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        references auth.users on delete set null,
  username       text,
  avatar_url     text,
  title          text,
  description    text,
  video_url      text,
  cover_url      text,
  upload_date    text,
  likes          int         not null default 0,
  shares         int         not null default 0,
  comments_count int         not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists videos_user_id_idx    on videos (user_id);
create index if not exists videos_created_at_idx on videos (created_at desc);

-- video_interactions
create table if not exists video_interactions (
  id         uuid        primary key default gen_random_uuid(),
  video_id   uuid        references videos     on delete cascade,
  user_id    uuid        references auth.users on delete cascade,
  type       text        not null check (type in ('like', 'share')),
  created_at timestamptz not null default now(),
  unique (video_id, user_id, type)
);

create index if not exists vi_video_id_idx on video_interactions (video_id);
create index if not exists vi_user_id_idx  on video_interactions (user_id);

-- comments
create table if not exists comments (
  id          uuid        primary key default gen_random_uuid(),
  video_id    uuid        references videos     on delete cascade,
  user_id     uuid        references auth.users on delete set null,
  username    text,
  avatar_url  text,
  text        text,
  created_at  timestamptz not null default now()
);

create index if not exists comments_video_id_idx on comments (video_id);

-- unlocked_characters
create table if not exists unlocked_characters (
  user_id       uuid        references auth.users on delete cascade,
  character_id  text        not null,
  unlocked_at   timestamptz not null default now(),
  primary key (user_id, character_id)
);

-- unlock_codes (also used for TCG QR batches)
create table if not exists unlock_codes (
  code           text        primary key,
  character_id   text        not null,
  character_name text        not null,
  is_redeemed    bool        not null default false,
  redeemed_by    uuid        references auth.users on delete set null,
  redeemed_at    timestamptz,
  batch_id       text,
  serial         text,
  redeem_url     text
);

-- songs
create table if not exists songs (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  artist        text,
  url           text,
  cover_url     text,
  status        text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected')),
  submitted_by  uuid        references auth.users on delete set null,
  uploader_name text,
  avatar_url    text,
  modes         text[]      default array[]::text[],
  trim_start    float       not null default 0,
  trim_end      float       not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists songs_status_idx       on songs (status);
create index if not exists songs_submitted_by_idx on songs (submitted_by);

-- notifications
create table if not exists notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users on delete cascade,
  title       text,
  body        text,
  type        text        default 'general',
  is_read     bool        not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on notifications (user_id);
create index if not exists notifications_created_idx on notifications (created_at desc);

-- support_messages
create table if not exists support_messages (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users on delete cascade,
  display_name text,
  body         text        not null,
  status       text        not null default 'open'
                           check (status in ('open', 'replied')),
  admin_reply  text,
  replied_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists support_messages_user_id_idx on support_messages (user_id);
create index if not exists support_messages_status_idx  on support_messages (status);

-- tcg_batches (QR code batches for character unlock)
create table if not exists tcg_batches (
  id           text        primary key,
  name         text        not null,
  description  text        default '',
  image        text        not null,
  character_id text        not null,
  created_by   uuid        references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

-- Link unlock_codes to tcg_batches
alter table unlock_codes
  add column if not exists batch_id text references tcg_batches(id) on delete cascade;


-- ================================================================
-- 2. is_admin_user() HELPER
--    MUST be created after profiles table.
--    Uses SECURITY DEFINER + empty search_path so it reads
--    profiles WITHOUT triggering RLS (prevents infinite recursion).
-- ================================================================

create or replace function is_admin_user()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid() limit 1),
    false
  );
$$;


-- ================================================================
-- 3. STORAGE BUCKETS
-- ================================================================

insert into storage.buckets (id, name, public)
values ('avatars',  'avatars',  true) on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('videos',   'videos',   true) on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('covers',   'covers',   true) on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('songs',    'songs',    true) on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('qr_codes', 'qr_codes', true) on conflict (id) do nothing;


-- ================================================================
-- 4. STORAGE POLICIES
-- ================================================================

drop policy if exists "avatars_public_read"  on storage.objects;
drop policy if exists "avatars_auth_insert"  on storage.objects;
drop policy if exists "avatars_auth_update"  on storage.objects;
drop policy if exists "avatars_auth_delete"  on storage.objects;
drop policy if exists "videos_public_read"   on storage.objects;
drop policy if exists "videos_auth_insert"   on storage.objects;
drop policy if exists "videos_auth_update"   on storage.objects;
drop policy if exists "videos_auth_delete"   on storage.objects;
drop policy if exists "covers_public_read"   on storage.objects;
drop policy if exists "covers_auth_insert"   on storage.objects;
drop policy if exists "covers_auth_update"   on storage.objects;
drop policy if exists "covers_auth_delete"   on storage.objects;
drop policy if exists "songs_public_read"    on storage.objects;
drop policy if exists "songs_auth_insert"    on storage.objects;
drop policy if exists "songs_auth_update"    on storage.objects;
drop policy if exists "qr_codes_public_read" on storage.objects;
drop policy if exists "qr_codes_admin_write" on storage.objects;

-- avatars
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars_auth_insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_auth_update" on storage.objects for update
  using (bucket_id = 'avatars' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_auth_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- videos
create policy "videos_public_read" on storage.objects for select
  using (bucket_id = 'videos');
create policy "videos_auth_insert" on storage.objects for insert
  with check (bucket_id = 'videos' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "videos_auth_update" on storage.objects for update
  using (bucket_id = 'videos' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "videos_auth_delete" on storage.objects for delete
  using (bucket_id = 'videos' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- covers
create policy "covers_public_read" on storage.objects for select
  using (bucket_id = 'covers');
create policy "covers_auth_insert" on storage.objects for insert
  with check (bucket_id = 'covers' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "covers_auth_update" on storage.objects for update
  using (bucket_id = 'covers' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "covers_auth_delete" on storage.objects for delete
  using (bucket_id = 'covers' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- songs
create policy "songs_public_read" on storage.objects for select
  using (bucket_id = 'songs');
create policy "songs_auth_insert" on storage.objects for insert
  with check (bucket_id = 'songs' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "songs_auth_update" on storage.objects for update
  using (bucket_id = 'songs' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- qr_codes (admin-write only)
create policy "qr_codes_public_read" on storage.objects for select
  using (bucket_id = 'qr_codes');
create policy "qr_codes_admin_write" on storage.objects for insert
  with check (bucket_id = 'qr_codes' and is_admin_user());


-- ================================================================
-- 5. ROW LEVEL SECURITY
--    All admin checks use is_admin_user() — no recursion.
-- ================================================================

-- profiles
alter table profiles enable row level security;
drop policy if exists "profiles_select_own"      on profiles;
drop policy if exists "profiles_select_admin"    on profiles;
drop policy if exists "profiles_select_public"   on profiles;
drop policy if exists "profiles_select_all"      on profiles;
drop policy if exists "profiles_update_own"      on profiles;
drop policy if exists "profiles_insert_trigger"  on profiles;

create policy "profiles_select_all"  on profiles for select  using (true);
create policy "profiles_update_own"  on profiles for update  using (auth.uid() = id);

-- videos
alter table videos enable row level security;
drop policy if exists "videos_select_all"   on videos;
drop policy if exists "videos_insert_own"   on videos;
drop policy if exists "videos_update_own"   on videos;
drop policy if exists "videos_delete_own"   on videos;
drop policy if exists "videos_delete_admin" on videos;

create policy "videos_select_all"   on videos for select  using (true);
create policy "videos_insert_own"   on videos for insert  with check (auth.uid() = user_id);
create policy "videos_update_own"   on videos for update  using (auth.uid() = user_id);
create policy "videos_delete_own"   on videos for delete  using (auth.uid() = user_id);
create policy "videos_delete_admin" on videos for delete  using (is_admin_user());

-- video_interactions
alter table video_interactions enable row level security;
drop policy if exists "vi_select_all"           on video_interactions;
drop policy if exists "vi_insert_authenticated" on video_interactions;
drop policy if exists "vi_delete_own"           on video_interactions;

create policy "vi_select_all"           on video_interactions for select using (true);
create policy "vi_insert_authenticated" on video_interactions for insert
  with check (auth.role() = 'authenticated');
create policy "vi_delete_own"           on video_interactions for delete
  using (auth.uid() = user_id);

-- comments
alter table comments enable row level security;
drop policy if exists "comments_select_all"           on comments;
drop policy if exists "comments_insert_authenticated" on comments;
drop policy if exists "comments_delete_own"           on comments;
drop policy if exists "comments_delete_admin"         on comments;

create policy "comments_select_all"           on comments for select using (true);
create policy "comments_insert_authenticated" on comments for insert
  with check (auth.role() = 'authenticated');
create policy "comments_delete_own"   on comments for delete using (auth.uid() = user_id);
create policy "comments_delete_admin" on comments for delete using (is_admin_user());

-- unlocked_characters
alter table unlocked_characters enable row level security;
drop policy if exists "unlocked_chars_select_own"   on unlocked_characters;
drop policy if exists "unlocked_chars_insert_own"   on unlocked_characters;
drop policy if exists "unlocked_chars_select_admin" on unlocked_characters;

create policy "unlocked_chars_select_own"   on unlocked_characters for select
  using (auth.uid() = user_id);
create policy "unlocked_chars_insert_own"   on unlocked_characters for insert
  with check (auth.uid() = user_id);
create policy "unlocked_chars_select_admin" on unlocked_characters for select
  using (is_admin_user());

-- unlock_codes
alter table unlock_codes enable row level security;
drop policy if exists "unlock_codes_select_authenticated" on unlock_codes;
drop policy if exists "unlock_codes_all_admin"            on unlock_codes;

create policy "unlock_codes_select_authenticated" on unlock_codes for select
  using (auth.role() = 'authenticated');
create policy "unlock_codes_all_admin" on unlock_codes for all
  using (is_admin_user());

-- songs
alter table songs enable row level security;
drop policy if exists "songs_select_approved"      on songs;
drop policy if exists "songs_insert_authenticated" on songs;
drop policy if exists "songs_all_admin"            on songs;

create policy "songs_select_approved"      on songs for select using (status = 'approved');
create policy "songs_insert_authenticated" on songs for insert
  with check (auth.role() = 'authenticated');
create policy "songs_all_admin" on songs for all using (is_admin_user());

-- notifications
alter table notifications enable row level security;
drop policy if exists "notifications_select_own"   on notifications;
drop policy if exists "notifications_update_own"   on notifications;
drop policy if exists "notifications_insert_admin" on notifications;

create policy "notifications_select_own" on notifications for select
  using (auth.uid() = user_id);
create policy "notifications_update_own" on notifications for update
  using (auth.uid() = user_id);
create policy "notifications_insert_admin" on notifications for insert
  with check (is_admin_user());

-- support_messages
alter table support_messages enable row level security;
drop policy if exists "support_messages_select_own" on support_messages;
drop policy if exists "support_messages_insert_own" on support_messages;
drop policy if exists "support_messages_all_admin"  on support_messages;

create policy "support_messages_select_own" on support_messages for select
  using (auth.uid() = user_id);
create policy "support_messages_insert_own" on support_messages for insert
  with check (auth.uid() = user_id);
create policy "support_messages_all_admin"  on support_messages for all
  using (is_admin_user());

-- tcg_batches
alter table tcg_batches enable row level security;
drop policy if exists "tcg_batches_admin_all" on tcg_batches;

create policy "tcg_batches_admin_all" on tcg_batches for all
  using (is_admin_user());


-- ================================================================
-- 6. COLUMN-LEVEL SECURITY ON PROFILES
--    Prevents clients from self-granting is_admin / is_premium.
-- ================================================================

revoke update on profiles from authenticated, anon;
grant  update (display_name, avatar_url, settings) on profiles to authenticated;

revoke select on profiles from authenticated, anon;
grant  select (id, display_name, avatar_url, is_admin, is_banned,
               is_premium, banned_until, settings, created_at)
  on profiles to authenticated;
grant  select (id, display_name, avatar_url, created_at)
  on profiles to anon;

grant insert on profiles to authenticated;

-- tcg_batches grants
grant select, insert, update, delete on public.tcg_batches to authenticated;
grant select on public.tcg_batches to anon;

-- admin_users view grant (created later, pre-grant now)
-- grant select on public.admin_users to authenticated;  -- done below after view creation


-- ================================================================
-- 7. TRIGGERS
-- ================================================================

-- Auto-create profile row on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Sync comments_count
create or replace function sync_comments_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if    (tg_op = 'INSERT') then
    update videos set comments_count = comments_count + 1 where id = new.video_id;
  elsif (tg_op = 'DELETE') then
    update videos set comments_count = greatest(comments_count - 1, 0) where id = old.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_comment_inserted on comments;
drop trigger if exists on_comment_deleted  on comments;
create trigger on_comment_inserted after insert on comments
  for each row execute function sync_comments_count();
create trigger on_comment_deleted  after delete on comments
  for each row execute function sync_comments_count();

-- Sync likes
create or replace function sync_likes_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if    (tg_op = 'INSERT' and new.type = 'like') then
    update videos set likes = likes + 1 where id = new.video_id;
  elsif (tg_op = 'DELETE' and old.type = 'like') then
    update videos set likes = greatest(likes - 1, 0) where id = old.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_like_inserted on video_interactions;
drop trigger if exists on_like_deleted  on video_interactions;
create trigger on_like_inserted after insert on video_interactions
  for each row execute function sync_likes_count();
create trigger on_like_deleted  after delete on video_interactions
  for each row execute function sync_likes_count();

-- Sync shares
create or replace function sync_shares_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.type = 'share') then
    update videos set shares = shares + 1 where id = new.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_share_inserted on video_interactions;
create trigger on_share_inserted after insert on video_interactions
  for each row execute function sync_shares_count();


-- ================================================================
-- 8. RPC FUNCTIONS
--    All admin checks use is_admin_user() — no recursion.
-- ================================================================

-- redeem_character_code
create or replace function redeem_character_code(
  input_code    text,
  claiming_user uuid
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  rec unlock_codes%rowtype;
begin
  select * into rec from unlock_codes where code = input_code for update;

  if not found then
    return json_build_object('success', false, 'error', 'Invalid code.');
  end if;

  if rec.is_redeemed then
    if rec.redeemed_by = claiming_user then
      return json_build_object('success', false, 'error', 'Already unlocked.',
        'characterId', rec.character_id, 'characterName', rec.character_name);
    end if;
    return json_build_object('success', false, 'error', 'Code already redeemed.');
  end if;

  update unlock_codes
  set is_redeemed = true, redeemed_by = claiming_user, redeemed_at = now()
  where code = input_code;

  insert into unlocked_characters (user_id, character_id)
  values (claiming_user, rec.character_id)
  on conflict do nothing;

  return json_build_object(
    'success', true,
    'characterId', rec.character_id,
    'characterName', rec.character_name
  );
end;
$$;

-- update_like_count (manual fallback)
create or replace function update_like_count(vid uuid, delta int)
returns void language sql security definer set search_path = public
as $$ update videos set likes = greatest(likes + delta, 0) where id = vid; $$;

-- update_share_count (manual fallback)
create or replace function update_share_count(vid uuid)
returns void language sql security definer set search_path = public
as $$ update videos set shares = shares + 1 where id = vid; $$;

-- get_user_stats
create or replace function get_user_stats(uid uuid)
returns json language sql security definer set search_path = public stable
as $$
  select json_build_object(
    'total_likes',  coalesce(sum(likes),  0),
    'total_shares', coalesce(sum(shares), 0),
    'video_count',  count(*)
  )
  from videos where user_id = uid;
$$;

-- set_admin_status (admin only)
create or replace function set_admin_status(target_user uuid, new_is_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;
  update profiles set is_admin = new_is_admin where id = target_user;
end; $$;

-- set_premium_status (admin only)
create or replace function set_premium_status(target_user uuid, new_is_premium boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;
  update profiles set is_premium = new_is_premium where id = target_user;
end; $$;

-- ban_user (admin only) — sends notification to app
create or replace function ban_user(
  target_user uuid,
  reason      text        default null,
  expiry      timestamptz default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;
  update profiles
  set is_banned = true, banned_until = expiry
  where id = target_user;
  insert into notifications (user_id, title, body, type, is_read)
  values (
    target_user,
    'Account Suspended',
    coalesce(reason, 'Your account has been suspended by an administrator.'),
    'ban',
    false
  );
end; $$;

-- unban_user (admin only) — sends notification to app
create or replace function unban_user(target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;
  update profiles set is_banned = false, banned_until = null where id = target_user;
  insert into notifications (user_id, title, body, type, is_read)
  values (
    target_user,
    'Account Restored',
    'Your account suspension has been lifted. You now have full access.',
    'unban',
    false
  );
end; $$;

-- send_notification (admin only) — pass target_user=null to broadcast
create or replace function send_notification(
  target_user uuid    default null,
  notif_title text    default 'New Notification',
  notif_body  text    default '',
  notif_type  text    default 'general'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;
  if target_user is not null then
    insert into notifications (user_id, title, body, type)
    values (target_user, notif_title, notif_body, notif_type);
  else
    insert into notifications (user_id, title, body, type)
    select id, notif_title, notif_body, notif_type from profiles;
  end if;
end; $$;

-- reply_to_support_message (admin only)
create or replace function reply_to_support_message(
  message_id uuid,
  reply_text text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;
  update support_messages
  set admin_reply = reply_text, status = 'replied', replied_at = now()
  where id = message_id;
  insert into notifications (user_id, title, body, type)
  select user_id, 'Admin replied to your message', reply_text, 'admin_reply'
  from support_messages where id = message_id;
end; $$;


-- ================================================================
-- 9. ADMIN DASHBOARD VIEW
--    Joins auth.users email into profiles so the web dashboard
--    can display email, last login, and all profile flags.
-- ================================================================

create or replace view public.admin_users
with (security_invoker = true)
as
select
  u.id,
  u.email,
  u.last_sign_in_at,
  p.display_name,
  p.avatar_url,
  p.is_admin,
  p.is_banned,
  p.is_premium,
  p.banned_until,
  p.created_at
from auth.users u
left join public.profiles p on p.id = u.id;

grant select on public.admin_users to authenticated;


-- ================================================================
-- 10. SEED DATA
--     Demo unlock codes + approved songs for testing.
-- ================================================================

insert into unlock_codes (code, character_id, character_name)
values
  ('DEMO_BEE_001',     '001D', 'Bee'),
  ('DEMO_BUNNY_002',   '002P', 'Bunny'),
  ('DEMO_CAT_003',     '003P', 'Cat'),
  ('DEMO_FOX_004',     '004P', 'Fox'),
  ('VIP_EXCLUSIVE_01', '005D', 'Special Character')
on conflict (code) do nothing;

insert into songs (title, artist, url, status)
values
  ('Demo Track 1', 'Artist A', 'https://example.com/song1.mp3', 'approved'),
  ('Demo Track 2', 'Artist B', 'https://example.com/song2.mp3', 'approved'),
  ('Pending Song',  'Artist C', 'https://example.com/song3.mp3', 'pending')
on conflict do nothing;


-- ================================================================
-- 11. ADMIN USER
--     Creates admin@kangi.com / 1234@678 and grants is_admin.
--     Safe to run multiple times (uses WHERE NOT EXISTS / ON CONFLICT).
-- ================================================================

-- Create auth user (skips if already exists)
insert into auth.users (
  id, instance_id, aud, role,
  email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change
)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@kangi.com',
  crypt('1234@678', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Kangi Admin"}',
  now(), now(),
  '', '', '', ''
where not exists (
  select 1 from auth.users where email = 'admin@kangi.com'
);

-- Confirm email
update auth.users
set email_confirmed_at = now()
where email = 'admin@kangi.com'
  and email_confirmed_at is null;

-- Create / update profile with is_admin = true
insert into public.profiles (id, display_name, is_admin)
select id, 'Kangi Admin', true
from auth.users where email = 'admin@kangi.com'
on conflict (id) do update
  set is_admin = true, display_name = 'Kangi Admin';


-- ================================================================
-- VERIFY — these queries should return the expected values
-- ================================================================

-- 1. Tables: should list 10 tables
select table_name from information_schema.tables
  where table_schema = 'public' order by table_name;

-- 2. Buckets: should list 5 buckets
select id, name, public from storage.buckets order by name;

-- 3. Functions: should include is_admin_user, ban_user, unban_user etc.
select routine_name from information_schema.routines
  where routine_schema = 'public' order by routine_name;

-- 4. Admin user check:
select u.email, (u.email_confirmed_at is not null) as confirmed, p.is_admin
from auth.users u join public.profiles p on p.id = u.id
where u.email = 'admin@kangi.com';

-- ================================================================
-- DONE
--
-- Admin Dashboard:  http://localhost:8080
-- Email:            admin@kangi.com
-- Password:         1234@678
-- ================================================================

-- ================================================================
-- SECTION 13 — REGISTER ADMIN FUNCTION (rgr.html)
-- ================================================================

create or replace function public.register_as_admin(reg_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  valid_token constant text := 'kangi-admin-2024';
begin
  if reg_token is null or reg_token <> valid_token then
    return json_build_object('success', false, 'error', 'Invalid registration token.');
  end if;
  if auth.uid() is null then
    return json_build_object('success', false, 'error', 'Not authenticated.');
  end if;
  insert into public.profiles (id, is_admin)
  values (auth.uid(), true)
  on conflict (id) do update set is_admin = true;
  return json_build_object('success', true, 'message', 'Admin access granted.');
end;
$$;

grant execute on function public.register_as_admin(text) to authenticated;
