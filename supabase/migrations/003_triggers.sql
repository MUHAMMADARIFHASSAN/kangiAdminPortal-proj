-- ============================================================
--  003_triggers.sql
--  Kangi — Database Triggers
--  Run after 001 and 002
-- ============================================================

-- ── Auto-create profile row on signup ────────────────────────
-- When a new user is created in auth.users, insert a matching
-- row in public.profiles so it always exists.

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


-- ── Keep comments_count in sync ──────────────────────────────
-- Increments videos.comments_count when a comment is inserted,
-- decrements when deleted.

create or replace function sync_comments_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update videos set comments_count = comments_count + 1 where id = new.video_id;
  elsif (tg_op = 'DELETE') then
    update videos set comments_count = greatest(comments_count - 1, 0) where id = old.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_comment_inserted on comments;
drop trigger if exists on_comment_deleted  on comments;

create trigger on_comment_inserted
  after insert on comments
  for each row execute function sync_comments_count();

create trigger on_comment_deleted
  after delete on comments
  for each row execute function sync_comments_count();


-- ── Keep likes count in sync ──────────────────────────────────
-- Increments / decrements videos.likes when a like interaction
-- is inserted or deleted.

create or replace function sync_likes_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.type = 'like') then
    update videos set likes = likes + 1 where id = new.video_id;
  elsif (tg_op = 'DELETE' and old.type = 'like') then
    update videos set likes = greatest(likes - 1, 0) where id = old.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_like_inserted on video_interactions;
drop trigger if exists on_like_deleted  on video_interactions;

create trigger on_like_inserted
  after insert on video_interactions
  for each row execute function sync_likes_count();

create trigger on_like_deleted
  after delete on video_interactions
  for each row execute function sync_likes_count();


-- ── Keep shares count in sync ─────────────────────────────────

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

create trigger on_share_inserted
  after insert on video_interactions
  for each row execute function sync_shares_count();
