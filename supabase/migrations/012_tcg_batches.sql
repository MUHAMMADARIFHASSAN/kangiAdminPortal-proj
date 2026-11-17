-- ============================================================
--  012_tcg_batches.sql
--  TCG batch metadata table — stores the image URL, name,
--  description for each QR batch created from the dashboard.
--  Individual codes live in unlock_codes with a batch_id FK.
--  Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Batch metadata
create table if not exists tcg_batches (
  id           text        primary key,
  name         text        not null,
  description  text        default '',
  image        text        not null,
  character_id text        not null,
  created_by   uuid        references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

-- Link codes to batches
alter table unlock_codes
  add column if not exists batch_id    text references tcg_batches(id) on delete cascade,
  add column if not exists serial      text,
  add column if not exists redeem_url  text;

-- RLS
alter table tcg_batches enable row level security;

-- Only admins can read/write batches
create policy "tcg_batches_admin_all"
  on tcg_batches for all
  using (is_admin_user());

-- Grant
grant select, insert, update, delete on public.tcg_batches to authenticated;
grant select on public.tcg_batches to anon;
