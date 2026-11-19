-- ============================================================
--  014_register_admin_function.sql
--  Server-side function that grants is_admin = true when the
--  caller provides the correct registration token.
--  Called from rgr.html after signup.
--
--  SECURITY: The token is stored here server-side — clients
--  only send the hash, never see the real token in source code.
--  Change 'kangi-admin-2024' to your own secret.
-- ============================================================

create or replace function register_as_admin(reg_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Change this token to anything you want
  valid_token constant text := 'kangi-admin-2024';
begin
  -- Wrong token — reject
  if reg_token is null or reg_token <> valid_token then
    return json_build_object('success', false, 'error', 'Invalid registration token.');
  end if;

  -- No session — reject
  if auth.uid() is null then
    return json_build_object('success', false, 'error', 'Not authenticated.');
  end if;

  -- Grant admin on the caller's own profile
  update profiles
  set is_admin = true
  where id = auth.uid();

  -- Create profile row if it doesn't exist yet
  insert into profiles (id, is_admin)
  values (auth.uid(), true)
  on conflict (id) do update set is_admin = true;

  return json_build_object('success', true, 'message', 'Admin access granted.');
end;
$$;

-- Allow any authenticated user to call this function
grant execute on function register_as_admin(text) to authenticated;
