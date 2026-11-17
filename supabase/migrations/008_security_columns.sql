-- ============================================================
--  008_security_columns.sql
--  Lock down privilege columns so a client cannot self-grant
--  admin / premium / un-ban themselves via a PATCH to profiles.
--
--  By default the `profiles_update_own` RLS policy lets a user
--  update their own row with NO column restriction, which is a
--  privilege-escalation hole. We fix it with column-level GRANTs:
--  the authenticated role may only UPDATE (display_name, avatar_url,
--  settings). is_admin / is_banned / banned_until / is_premium stay
--  writable only through SECURITY DEFINER functions.
-- ============================================================

-- Revoke all update rights first, then grant back only the safe columns
revoke update on profiles from authenticated, anon;

grant update (display_name, avatar_url, settings) on profiles to authenticated;

-- Select: allow reading only the public-facing columns of ANY profile
-- (so clients can resolve a song/video uploader's avatar & display name),
-- while keeping is_admin / is_banned / is_premium / banned_until private.
revoke select on profiles from authenticated, anon;
grant select (id, display_name, avatar_url, created_at) on profiles to authenticated, anon;

drop policy if exists "profiles_select_public" on profiles;
create policy "profiles_select_public"
  on profiles for select
  using (true);

-- Insert still allowed (trigger creates the row)
grant insert on profiles to authenticated;


-- ── SECURITY DEFINER functions for privileged writes ───────────

-- Set admin status (admin-only). Call from admin dashboard.
create or replace function set_admin_status(target_user uuid, new_is_admin boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  update profiles set is_admin = new_is_admin where id = target_user;
end;
$$;

-- Set premium status (admin-only).
create or replace function set_premium_status(target_user uuid, new_is_premium boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  update profiles set is_premium = new_is_premium where id = target_user;
end;
$$;


-- ── Verify: a normal user must NOT be able to flip is_admin ────
-- (Run manually to sanity check, then comment out)
--
-- select set_admin_status('<your_uuid>', true);  -- works only if you are already admin
