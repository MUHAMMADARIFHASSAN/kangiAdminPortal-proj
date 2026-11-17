-- ============================================================
--  005_storage.sql
--  Kangi — Supabase Storage bucket policies
--
--  NOTE: Buckets themselves must be created manually in the
--  Supabase Dashboard → Storage, OR via the management API.
--  This file only sets the access policies once the buckets
--  exist.
--
--  Buckets to create (Dashboard → Storage → New bucket):
--    Name: avatars  | Public: ON
--    Name: videos   | Public: ON
--    Name: covers   | Public: ON
-- ============================================================

-- ── avatars ───────────────────────────────────────────────────
-- Public read (anyone can see profile pictures)
-- Authenticated write (each user can only write their own path)

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_auth_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    -- Enforce path: <user_id>/profile.jpg
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_auth_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_auth_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── videos ────────────────────────────────────────────────────
-- Public read
-- Authenticated write — user can only write under their own folder

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

create policy "videos_public_read"
  on storage.objects for select
  using (bucket_id = 'videos');

create policy "videos_auth_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "videos_auth_update"
  on storage.objects for update
  using (
    bucket_id = 'videos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "videos_auth_delete"
  on storage.objects for delete
  using (
    bucket_id = 'videos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── covers ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "covers_public_read"
  on storage.objects for select
  using (bucket_id = 'covers');

create policy "covers_auth_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "covers_auth_update"
  on storage.objects for update
  using (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "covers_auth_delete"
  on storage.objects for delete
  using (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
