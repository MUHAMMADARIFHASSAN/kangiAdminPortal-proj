-- ============================================================
--  002_rls_policies.sql
--  Kangi — Row Level Security policies
--  Run after 001_initial_schema.sql
-- ============================================================

-- ── Profiles ─────────────────────────────────────────────────

alter table profiles enable row level security;

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id);

-- Admins can read all profiles
create policy "profiles_select_admin"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ── Videos ───────────────────────────────────────────────────

alter table videos enable row level security;

create policy "videos_select_all"
  on videos for select
  using (true);

create policy "videos_insert_own"
  on videos for insert
  with check (auth.uid() = user_id);

create policy "videos_update_own"
  on videos for update
  using (auth.uid() = user_id);

create policy "videos_delete_own"
  on videos for delete
  using (auth.uid() = user_id);

-- Admins can delete any video
create policy "videos_delete_admin"
  on videos for delete
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ── Video Interactions ────────────────────────────────────────

alter table video_interactions enable row level security;

create policy "vi_select_all"
  on video_interactions for select
  using (true);

create policy "vi_insert_authenticated"
  on video_interactions for insert
  with check (auth.role() = 'authenticated');

create policy "vi_delete_own"
  on video_interactions for delete
  using (auth.uid() = user_id);

-- ── Comments ─────────────────────────────────────────────────

alter table comments enable row level security;

create policy "comments_select_all"
  on comments for select
  using (true);

create policy "comments_insert_authenticated"
  on comments for insert
  with check (auth.role() = 'authenticated');

create policy "comments_delete_own"
  on comments for delete
  using (auth.uid() = user_id);

-- Admins can delete any comment
create policy "comments_delete_admin"
  on comments for delete
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ── Unlocked Characters ──────────────────────────────────────

alter table unlocked_characters enable row level security;

create policy "unlocked_chars_select_own"
  on unlocked_characters for select
  using (auth.uid() = user_id);

create policy "unlocked_chars_insert_own"
  on unlocked_characters for insert
  with check (auth.uid() = user_id);

-- Admins can read all
create policy "unlocked_chars_select_admin"
  on unlocked_characters for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ── Unlock Codes ─────────────────────────────────────────────

alter table unlock_codes enable row level security;

-- Anyone authenticated can read (needed to validate a code before redeem)
-- The redeem RPC function uses SECURITY DEFINER so it bypasses RLS safely
create policy "unlock_codes_select_authenticated"
  on unlock_codes for select
  using (auth.role() = 'authenticated');

-- Only admins can insert / update / delete codes directly
create policy "unlock_codes_all_admin"
  on unlock_codes for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ── Songs ────────────────────────────────────────────────────

alter table songs enable row level security;

-- Approved songs are publicly readable
create policy "songs_select_approved"
  on songs for select
  using (status = 'approved');

-- Admins can do everything
create policy "songs_all_admin"
  on songs for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Authenticated users can submit (insert) songs
create policy "songs_insert_authenticated"
  on songs for insert
  with check (auth.role() = 'authenticated');

-- ── Notifications ─────────────────────────────────────────────

alter table notifications enable row level security;

create policy "notifications_select_own"
  on notifications for select
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on notifications for update
  using (auth.uid() = user_id);

-- Admins can insert notifications for any user
create policy "notifications_insert_admin"
  on notifications for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
