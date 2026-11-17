-- ============================================================
--  011_users_view.sql
--  Creates a view that joins auth.users email into profiles
--  so the admin dashboard can see email + all profile fields.
--  Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- View: admin_users
-- Joins auth.users (email, last_sign_in_at) with public.profiles
-- Only readable by authenticated users with is_admin = true
create or replace view public.admin_users
with (security_invoker = true)
as
select
  u.id,
  u.email,
  u.last_sign_in_at,
  u.created_at                          as auth_created_at,
  p.display_name,
  p.avatar_url,
  p.is_admin,
  p.is_banned,
  p.is_premium,
  p.banned_until,
  p.created_at
from auth.users u
left join public.profiles p on p.id = u.id;

-- Grant read access to authenticated users
-- RLS is enforced via security_invoker — only is_admin_user() will
-- be able to read all rows (via the profiles join check).
grant select on public.admin_users to authenticated;
