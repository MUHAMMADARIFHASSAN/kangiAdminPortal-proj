-- ============================================================
--  004_functions.sql
--  Kangi — Server-Side RPC Functions
--  Run after 001, 002, 003
-- ============================================================

-- ── redeem_character_code ─────────────────────────────────────
-- Called by SupabaseDb.RedeemCode() from Unity.
-- SECURITY DEFINER so it can write to unlock_codes even though
-- users only have SELECT on that table.
--
-- Returns JSON:
--   { "success": true,  "characterId": "...", "characterName": "..." }
--   { "success": false, "error": "..." }

create or replace function redeem_character_code(
  input_code     text,
  claiming_user  uuid
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  rec unlock_codes%rowtype;
begin
  -- Lock the row so concurrent redemptions can't both succeed
  select * into rec
  from unlock_codes
  where code = input_code
  for update;

  if not found then
    return json_build_object(
      'success', false,
      'error', 'Invalid code.'
    );
  end if;

  if rec.is_redeemed then
    -- Check if it was redeemed by the same user (idempotent)
    if rec.redeemed_by = claiming_user then
      return json_build_object(
        'success', false,
        'error', 'Already unlocked.',
        'characterId',   rec.character_id,
        'characterName', rec.character_name
      );
    end if;
    return json_build_object(
      'success', false,
      'error', 'Code already redeemed.'
    );
  end if;

  -- Mark code as used
  update unlock_codes
  set
    is_redeemed = true,
    redeemed_by = claiming_user,
    redeemed_at = now()
  where code = input_code;

  -- Grant character to user (safe on conflict)
  insert into unlocked_characters (user_id, character_id)
  values (claiming_user, rec.character_id)
  on conflict do nothing;

  return json_build_object(
    'success',       true,
    'characterId',   rec.character_id,
    'characterName', rec.character_name
  );
end;
$$;


-- ── update_like_count ─────────────────────────────────────────
-- Fallback manual RPC in case the trigger approach is not used.
-- Called by SupabaseDb.LikeVideo() as a safety net.

create or replace function update_like_count(
  vid   uuid,
  delta int
)
returns void
language sql
security definer set search_path = public
as $$
  update videos
  set likes = greatest(likes + delta, 0)
  where id = vid;
$$;


-- ── update_share_count ────────────────────────────────────────

create or replace function update_share_count(
  vid uuid
)
returns void
language sql
security definer set search_path = public
as $$
  update videos
  set shares = shares + 1
  where id = vid;
$$;


-- ── get_video_feed ────────────────────────────────────────────
-- Returns all videos newest-first with comment list joined.
-- Optional: use this RPC instead of the REST endpoint for more
-- complex joins in future.

create or replace function get_video_feed()
returns setof videos
language sql
security definer set search_path = public
stable
as $$
  select * from videos order by created_at desc;
$$;


-- ── get_user_stats ────────────────────────────────────────────
-- Returns total likes and shares for a given user's videos.
-- Called by ProfileManager_Supabase when computing totals.

create or replace function get_user_stats(uid uuid)
returns json
language sql
security definer set search_path = public
stable
as $$
  select json_build_object(
    'total_likes',  coalesce(sum(likes),  0),
    'total_shares', coalesce(sum(shares), 0),
    'video_count',  count(*)
  )
  from videos
  where user_id = uid;
$$;


-- ── ban_user ──────────────────────────────────────────────────
-- Admin-only: sets is_banned = true on a profile and optionally
-- sets an expiry. Call this from your admin panel.

create or replace function ban_user(
  target_user   uuid,
  reason        text    default null,
  expiry        timestamptz default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only admins may call this
  if not exists (
    select 1 from profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  update profiles
  set
    is_banned    = true,
    banned_until = expiry
  where id = target_user;

  -- Insert a notification for the banned user
  insert into notifications (user_id, title, body, type)
  values (
    target_user,
    'Account Suspended',
    coalesce(reason, 'Your account has been suspended.'),
    'ban'
  );
end;
$$;


-- ── unban_user ────────────────────────────────────────────────

create or replace function unban_user(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  update profiles
  set is_banned = false, banned_until = null
  where id = target_user;
end;
$$;


-- ── send_notification ─────────────────────────────────────────
-- Admin-only: broadcast a notification to one or all users.
-- Pass target_user = null to send to everyone.

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
  if not exists (
    select 1 from profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  if target_user is not null then
    insert into notifications (user_id, title, body, type)
    values (target_user, notif_title, notif_body, notif_type);
  else
    -- Broadcast to all users
    insert into notifications (user_id, title, body, type)
    select id, notif_title, notif_body, notif_type
    from profiles;
  end if;
end;
$$;
