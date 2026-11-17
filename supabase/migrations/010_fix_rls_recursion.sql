-- ============================================================
--  010_fix_rls_recursion.sql
--  Fixes: "infinite recursion detected in policy for relation profiles"
--
--  Root cause: policies on `profiles` were calling
--    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
--  which re-enters the same RLS policies → infinite loop.
--
--  Fix: replace all self-referencing admin checks with a
--  SECURITY DEFINER function that bypasses RLS entirely.
-- ============================================================

-- ── 1. Helper function — reads is_admin WITHOUT triggering RLS ──
-- SECURITY DEFINER + search_path = '' means it runs as the
-- function owner (postgres) and skips row-level policies.

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

-- ── 2. Drop ALL existing profiles policies ──────────────────
-- We recreate them cleanly below so there are no duplicates.

drop policy if exists "profiles_select_own"      on public.profiles;
drop policy if exists "profiles_update_own"      on public.profiles;
drop policy if exists "profiles_select_admin"    on public.profiles;
drop policy if exists "profiles_select_public"   on public.profiles;
drop policy if exists "profiles_insert_trigger"  on public.profiles;

-- ── 3. Recreate profiles policies (no self-reference) ───────

-- Anyone (even anon) can read the public columns of any profile
-- (needed for video/song uploader avatar + name lookups).
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

-- Users can only update their own safe columns
-- (column-level grants in 008 restrict WHICH columns they can touch).
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- ── 4. Drop & recreate admin-check policies on other tables ─
-- These had the same recursive pattern.

-- videos
drop policy if exists "videos_delete_admin" on public.videos;
create policy "videos_delete_admin"
  on public.videos for delete
  using (is_admin_user());

-- comments
drop policy if exists "comments_delete_admin" on public.comments;
create policy "comments_delete_admin"
  on public.comments for delete
  using (is_admin_user());

-- unlocked_characters
drop policy if exists "unlocked_chars_select_admin" on public.unlocked_characters;
create policy "unlocked_chars_select_admin"
  on public.unlocked_characters for select
  using (is_admin_user());

-- unlock_codes
drop policy if exists "unlock_codes_all_admin" on public.unlock_codes;
create policy "unlock_codes_all_admin"
  on public.unlock_codes for all
  using (is_admin_user());

-- songs
drop policy if exists "songs_all_admin" on public.songs;
create policy "songs_all_admin"
  on public.songs for all
  using (is_admin_user());

-- notifications
drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin"
  on public.notifications for insert
  with check (is_admin_user());

-- support_messages
drop policy if exists "support_messages_all_admin" on public.support_messages;
create policy "support_messages_all_admin"
  on public.support_messages for all
  using (is_admin_user());

-- storage objects (qr_codes bucket)
drop policy if exists "qr_codes_admin_write" on storage.objects;
create policy "qr_codes_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'qr_codes'
    and is_admin_user()
  );

-- ── 5. Fix the set_admin_status / set_premium_status functions ──
-- These also had a recursive profiles check. Use is_admin_user() instead.

create or replace function set_admin_status(target_user uuid, new_is_admin boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Unauthorized';
  end if;
  update profiles set is_admin = new_is_admin where id = target_user;
end;
$$;

create or replace function set_premium_status(target_user uuid, new_is_premium boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Unauthorized';
  end if;
  update profiles set is_premium = new_is_premium where id = target_user;
end;
$$;

create or replace function ban_user(
  target_user uuid,
  reason      text    default null,
  expiry      timestamptz default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Unauthorized';
  end if;
  update profiles
  set is_banned = true, banned_until = expiry
  where id = target_user;
  insert into notifications (user_id, title, body, type)
  values (target_user, 'Account Suspended',
          coalesce(reason, 'Your account has been suspended.'), 'ban');
end;
$$;

create or replace function unban_user(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Unauthorized';
  end if;
  update profiles set is_banned = false, banned_until = null where id = target_user;
end;
$$;

create or replace function send_notification(
  target_user  uuid    default null,
  notif_title  text    default 'New Notification',
  notif_body   text    default '',
  notif_type   text    default 'general'
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Unauthorized';
  end if;
  if target_user is not null then
    insert into notifications (user_id, title, body, type)
    values (target_user, notif_title, notif_body, notif_type);
  else
    insert into notifications (user_id, title, body, type)
    select id, notif_title, notif_body, notif_type from profiles;
  end if;
end;
$$;

create or replace function reply_to_support_message(
  message_id  uuid,
  reply_text  text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Unauthorized';
  end if;
  update support_messages
  set admin_reply = reply_text, status = 'replied', replied_at = now()
  where id = message_id;
  insert into notifications (user_id, title, body, type)
  select user_id, 'Admin replied to your message', reply_text, 'admin_reply'
  from support_messages where id = message_id;
end;
$$;

-- ── Done ────────────────────────────────────────────────────
-- Verify with:
--   select is_admin_user();   -- should return false for a normal user
