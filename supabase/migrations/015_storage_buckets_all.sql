-- ============================================================
--  015_storage_buckets_all.sql
--  Ensures all 5 storage buckets exist and have proper RLS
--  Replaces Cloudinary storage completely with Supabase Storage
-- ============================================================

-- 1. Create all 5 public buckets
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('qr_codes', 'qr_codes', true)
on conflict (id) do update set public = true;


-- 2. Storage Policies (Clean Drop & Recreate)
drop policy if exists "avatars_public_read"  on storage.objects;
drop policy if exists "avatars_auth_insert"  on storage.objects;
drop policy if exists "avatars_auth_update"  on storage.objects;
drop policy if exists "avatars_auth_delete"  on storage.objects;

drop policy if exists "videos_public_read"   on storage.objects;
drop policy if exists "videos_auth_insert"   on storage.objects;
drop policy if exists "videos_auth_update"   on storage.objects;
drop policy if exists "videos_auth_delete"   on storage.objects;

drop policy if exists "covers_public_read"   on storage.objects;
drop policy if exists "covers_auth_insert"   on storage.objects;
drop policy if exists "covers_auth_update"   on storage.objects;
drop policy if exists "covers_auth_delete"   on storage.objects;

drop policy if exists "songs_public_read"    on storage.objects;
drop policy if exists "songs_auth_insert"    on storage.objects;
drop policy if exists "songs_auth_update"    on storage.objects;
drop policy if exists "songs_auth_delete"    on storage.objects;

drop policy if exists "qr_codes_public_read" on storage.objects;
drop policy if exists "qr_codes_auth_insert" on storage.objects;
drop policy if exists "qr_codes_auth_update" on storage.objects;
drop policy if exists "qr_codes_admin_write" on storage.objects;


-- ── avatars ──
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_auth_insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "avatars_auth_update" on storage.objects for update
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "avatars_auth_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');


-- ── videos ──
create policy "videos_public_read" on storage.objects for select
  using (bucket_id = 'videos');

create policy "videos_auth_insert" on storage.objects for insert
  with check (bucket_id = 'videos' and auth.role() = 'authenticated');

create policy "videos_auth_update" on storage.objects for update
  using (bucket_id = 'videos' and auth.role() = 'authenticated');

create policy "videos_auth_delete" on storage.objects for delete
  using (bucket_id = 'videos' and auth.role() = 'authenticated');


-- ── covers ──
create policy "covers_public_read" on storage.objects for select
  using (bucket_id = 'covers');

create policy "covers_auth_insert" on storage.objects for insert
  with check (bucket_id = 'covers' and auth.role() = 'authenticated');

create policy "covers_auth_update" on storage.objects for update
  using (bucket_id = 'covers' and auth.role() = 'authenticated');

create policy "covers_auth_delete" on storage.objects for delete
  using (bucket_id = 'covers' and auth.role() = 'authenticated');


-- ── songs ──
create policy "songs_public_read" on storage.objects for select
  using (bucket_id = 'songs');

create policy "songs_auth_insert" on storage.objects for insert
  with check (bucket_id = 'songs' and auth.role() = 'authenticated');

create policy "songs_auth_update" on storage.objects for update
  using (bucket_id = 'songs' and auth.role() = 'authenticated');

create policy "songs_auth_delete" on storage.objects for delete
  using (bucket_id = 'songs' and auth.role() = 'authenticated');


-- ── qr_codes ──
create policy "qr_codes_public_read" on storage.objects for select
  using (bucket_id = 'qr_codes');

create policy "qr_codes_auth_insert" on storage.objects for insert
  with check (bucket_id = 'qr_codes' and auth.role() = 'authenticated');

create policy "qr_codes_auth_update" on storage.objects for update
  using (bucket_id = 'qr_codes' and auth.role() = 'authenticated');
