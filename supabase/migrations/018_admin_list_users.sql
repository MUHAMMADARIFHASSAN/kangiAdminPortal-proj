-- ============================================================
--  018_admin_list_users.sql
--  Fix: dashboard GET /admin_users → 403.
--  The admin_users view reads auth.users with security_invoker,
--  and the "authenticated" role cannot read auth.users, so the
--  dashboard fell back to profiles (no emails / last sign-in).
--
--  admin_list_users() runs as definer and returns the same
--  columns — but only to a (non-banned) admin. Everyone else
--  gets "Unauthorized".
--
--  Requires is_admin_user() (from 016 / 010).
--  Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================

create or replace function public.admin_list_users(p_email text default null)
returns table (
  id              uuid,
  email           text,
  display_name    text,
  avatar_url      text,
  is_admin        boolean,
  is_banned       boolean,
  is_premium      boolean,
  banned_until    timestamptz,
  created_at      timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_admin_user() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select u.id,
         u.email::text,
         p.display_name,
         p.avatar_url,
         coalesce(p.is_admin,   false),
         coalesce(p.is_banned,  false),
         coalesce(p.is_premium, false),
         p.banned_until,
         coalesce(p.created_at, u.created_at),
         u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
   where p_email is null or lower(u.email) = lower(trim(p_email))
   order by coalesce(p.created_at, u.created_at) desc;
end;
$$;

revoke execute on function public.admin_list_users(text) from public, anon;
grant  execute on function public.admin_list_users(text) to authenticated;

notify pgrst, 'reload schema';
