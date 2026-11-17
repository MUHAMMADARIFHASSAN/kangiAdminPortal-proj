-- ============================================================
--  001_initial_schema.sql
--  Kangi — Initial Supabase Schema
--  Run this first in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Profiles ──────────────────────────────────────────────
-- Extends auth.users with app-level data.
-- A trigger (see 003_triggers.sql) auto-inserts a row on signup.

create table if not exists profiles (
  id            uuid        primary key references auth.users on delete cascade,
  display_name  text,
  avatar_url    text,
  is_admin      bool        not null default false,
  is_banned     bool        not null default false,
  banned_until  timestamptz,
  created_at    timestamptz not null default now()
);

-- ── 2. Videos ────────────────────────────────────────────────

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

-- ── 3. Video Interactions (likes & shares) ───────────────────

create table if not exists video_interactions (
  id        uuid primary key default gen_random_uuid(),
  video_id  uuid references videos   on delete cascade,
  user_id   uuid references auth.users on delete cascade,
  type      text not null check (type in ('like', 'share')),
  created_at timestamptz not null default now(),
  unique (video_id, user_id, type)
);

create index if not exists vi_video_id_idx on video_interactions (video_id);
create index if not exists vi_user_id_idx  on video_interactions (user_id);

-- ── 4. Comments ──────────────────────────────────────────────

create table if not exists comments (
  id          uuid        primary key default gen_random_uuid(),
  video_id    uuid        references videos    on delete cascade,
  user_id     uuid        references auth.users on delete set null,
  username    text,
  avatar_url  text,
  text        text,
  created_at  timestamptz not null default now()
);

create index if not exists comments_video_id_idx on comments (video_id);

-- ── 5. Unlocked Characters ───────────────────────────────────

create table if not exists unlocked_characters (
  user_id       uuid references auth.users on delete cascade,
  character_id  text not null,
  unlocked_at   timestamptz not null default now(),
  primary key (user_id, character_id)
);

-- ── 6. Unlock Codes ──────────────────────────────────────────

create table if not exists unlock_codes (
  code            text        primary key,
  character_id    text        not null,
  character_name  text        not null,
  is_redeemed     bool        not null default false,
  redeemed_by     uuid        references auth.users on delete set null,
  redeemed_at     timestamptz
);

-- ── 7. Songs ─────────────────────────────────────────────────

create table if not exists songs (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  artist      text,
  url         text,
  cover_url   text,
  status      text        not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid       references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists songs_status_idx on songs (status);

-- ── 8. Notifications ─────────────────────────────────────────

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
