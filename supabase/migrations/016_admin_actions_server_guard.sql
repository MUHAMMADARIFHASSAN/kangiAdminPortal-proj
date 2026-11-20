-- ============================================================
--  016_admin_actions_server_guard.sql
--  Server-side guard: ONLY an admin can make a user admin,
--  give/remove premium, or ban/unban. The check runs inside
--  Postgres, so it cannot be bypassed from the dashboard,
--  the Unity app, or a hand-crafted REST call.
--
--  Layers:
--    1. is_admin_user()  — caller must be admin AND not banned
--    2. Trigger on profiles — blocks any direct write to
--       is_admin / is_premium / is_banned / banned_until by a
--       non-admin (backup for the column-level grants in 008)
--    3. Admin RPCs re-created with the check + self-lockout
--       protection + "user not found" error
--    4. am_i_admin() RPC — dashboard asks the server at login
--    5. EXECUTE on admin RPCs: authenticated only (no anon)
--    6. register_as_admin() removed (shared token = anyone
--       could become admin)
--
--  Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================


-- ── 1. Admin check: admin flag AND not currently banned ───────
create or replace function public.is_admin_user()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select p.is_admin
            and not (p.is_banned
                     and (p.banned_until is null or p.banned_until > now()))
       from public.profiles p
      where p.id = auth.uid()
      limit 1),
    false
  );
$$;


-- ── 2. Trigger: protect privileged columns on profiles ────────
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No end-user JWT (service role, SQL editor, auth signup trigger):
  -- trusted server context, allow.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.is_admin_user() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A user creating their own row can never start as admin/premium/banned-free-pass
    new.is_admin     := false;
    new.is_premium   := false;
    new.is_banned    := false;
    new.banned_until := null;
    return new;
  end if;

  if new.is_admin     is distinct from old.is_admin
  or new.is_premium   is distinct from old.is_premium
  or new.is_banned    is distinct from old.is_banned
  or new.banned_until is distinct from old.banned_until then
    raise exception 'Only an admin can change admin, premium or ban status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();


-- ── 3. Admin RPCs ─────────────────────────────────────────────
-- Shared check used by every admin action.
create or replace function public.assert_admin_action(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not public.is_admin_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if target_user is null
     or not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Make / revoke admin
create or replace function public.set_admin_status(target_user uuid, new_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_action(target_user);
  if target_user = auth.uid() and not new_is_admin then
    raise exception 'You cannot remove your own admin access.';
  end if;
  update profiles set is_admin = new_is_admin where id = target_user;
end;
$$;

-- Give / remove premium
create or replace function public.set_premium_status(target_user uuid, new_is_premium boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_action(target_user);
  update profiles set is_premium = new_is_premium where id = target_user;
end;
$$;

-- Ban (expiry null = permanent) — also notifies the app
create or replace function public.ban_user(
  target_user uuid,
  reason      text        default null,
  expiry      timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_action(target_user);
  if target_user = auth.uid() then
    raise exception 'You cannot ban yourself.';
  end if;

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
end;
$$;

-- Unban — also notifies the app
create or replace function public.unban_user(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_action(target_user);

  update profiles
     set is_banned = false, banned_until = null
   where id = target_user;

  insert into notifications (user_id, title, body, type, is_read)
  values (
    target_user,
    'Account Restored',
    'Your account suspension has been lifted. You now have full access.',
    'unban',
    false
  );
end;
$$;


-- ── 4. Dashboard login check ──────────────────────────────────
create or replace function public.am_i_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.is_admin_user();
$$;


-- ── 5. Who may call what ──────────────────────────────────────
revoke execute on function public.assert_admin_action(uuid)                       from public, anon, authenticated;
revoke execute on function public.set_admin_status(uuid, boolean)                 from public, anon;
revoke execute on function public.set_premium_status(uuid, boolean)               from public, anon;
revoke execute on function public.ban_user(uuid, text, timestamptz)               from public, anon;
revoke execute on function public.unban_user(uuid)                                from public, anon;
revoke execute on function public.am_i_admin()                                    from public, anon;

grant  execute on function public.set_admin_status(uuid, boolean)                 to authenticated;
grant  execute on function public.set_premium_status(uuid, boolean)               to authenticated;
grant  execute on function public.ban_user(uuid, text, timestamptz)               to authenticated;
grant  execute on function public.unban_user(uuid)                                to authenticated;
grant  execute on function public.am_i_admin()                                    to authenticated;


-- ── 6. Remove shared-token self-promotion ─────────────────────
-- Admins are now created only by another admin (set_admin_status)
-- or by running SQL in the dashboard (create_admin_user.sql).
drop function if exists public.register_as_admin(text);


-- ── Verify (run after, signed-in checks need a real user) ─────
-- select proname from pg_proc
--  where proname in ('is_admin_user','guard_profile_privileged_columns',
--                    'assert_admin_action','set_admin_status','set_premium_status',
--                    'ban_user','unban_user','am_i_admin');
-- select tgname from pg_trigger where tgname = 'guard_profile_privileged_columns';
