-- ============================================================
--  009_songs_full_columns.sql
--  Extends the `songs` table to store the full SongData the app
--  round-trips (modes, trim points, uploader identity), and adds
--  a public storage bucket for audio files.
-- ============================================================

alter table songs add column if not exists uploader_name text;
alter table songs add column if not exists avatar_url    text;
alter table songs add column if not exists modes         text[]     default array[]::text[];
alter table songs add column if not exists trim_start    float      not null default 0;
alter table songs add column if not exists trim_end      float      not null default 0;

-- index already exists on status; add one on submitted_by
create index if not exists songs_submitted_by_idx on songs (submitted_by);


-- ── songs audio storage bucket ──────────────────────────────
-- (Re-asserts the policies from 007 in case this runs first.)

insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do nothing;

drop policy if exists "songs_public_read"    on storage.objects;
drop policy if exists "songs_auth_insert"     on storage.objects;

create policy "songs_public_read"
  on storage.objects for select
  using (bucket_id = 'songs');

create policy "songs_auth_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'songs'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "songs_auth_update"
  on storage.objects for update
  using (
    bucket_id = 'songs'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
