-- ============================================================
--  013_fix_ban_notifications.sql
--  Fixes ban_user() and unban_user() so they both send a
--  notification that the app can display immediately.
--  Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── ban_user ─────────────────────────────────────────────────
create or replace function ban_user(
  target_user uuid,
  reason      text        default null,
  expiry      timestamptz default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;

  update profiles
  set is_banned = true, banned_until = expiry
  where id = target_user;

  -- Insert ban notification so the app reacts in real-time
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


-- ── unban_user ───────────────────────────────────────────────
create or replace function unban_user(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin_user() then raise exception 'Unauthorized'; end if;

  update profiles
  set is_banned = false, banned_until = null
  where id = target_user;

  -- Insert unban notification so the app lifts restrictions in real-time
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
