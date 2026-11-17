-- ============================================================
--  007_support_messages.sql
--  Support inbox: ContactAdmin.cs sends messages here,
--  InboxViewer.cs reads them, admin dashboard replies.
-- ============================================================

create table if not exists support_messages (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users on delete cascade,
  display_name text,
  body         text        not null,
  status       text        not null default 'open'
                           check (status in ('open', 'replied')),
  admin_reply  text,
  replied_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists support_messages_user_id_idx on support_messages (user_id);
create index if not exists support_messages_status_idx  on support_messages (status);

-- ── RLS ──────────────────────────────────────────────────────

alter table support_messages enable row level security;

-- Users can only see their own messages
create policy "support_messages_select_own"
  on support_messages for select
  using (auth.uid() = user_id);

-- Users can send messages (insert)
create policy "support_messages_insert_own"
  on support_messages for insert
  with check (auth.uid() = user_id);

-- Only admins can see all messages and reply
create policy "support_messages_all_admin"
  on support_messages for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );


-- ── is_premium column on profiles ────────────────────────────
-- Needed by UploadButtonHandler_Supabase.cs premium check

alter table profiles add column if not exists is_premium bool not null default false;

-- ── settings column on profiles ──────────────────────────────
-- Needed by BgOrientationRemoteConfig.cs (per-user remote config).
-- Stored as TEXT holding a JSON string so the client can round-trip
-- it cleanly through JsonUtility.

alter table profiles add column if not exists settings text not null default '{}';

-- ── cover_url column on songs ─────────────────────────────────
-- Already in 001 schema; this is a safety re-add with IF NOT EXISTS

alter table songs add column if not exists cover_url text;
alter table songs add column if not exists submitted_by uuid references auth.users on delete set null;


-- ── RPC: reply_to_support_message ────────────────────────────
-- Admin-only function to reply to a support message

create or replace function reply_to_support_message(
  message_id  uuid,
  reply_text  text
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

  update support_messages
  set
    admin_reply = reply_text,
    status      = 'replied',
    replied_at  = now()
  where id = message_id;

  -- Notify the user
  insert into notifications (user_id, title, body, type)
  select user_id, 'Admin replied to your message', reply_text, 'admin_reply'
  from support_messages
  where id = message_id;
end;
$$;


-- ── qr_codes storage bucket ───────────────────────────────────
-- For QRImageUploadManager

insert into storage.buckets (id, name, public)
values ('qr_codes', 'qr_codes', true)
on conflict (id) do nothing;

create policy "qr_codes_public_read"
  on storage.objects for select
  using (bucket_id = 'qr_codes');

create policy "qr_codes_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'qr_codes'
    and exists (
      select 1 from profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- ── songs storage bucket ──────────────────────────────────────
-- For audio file uploads from MusicManager

insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do nothing;

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
