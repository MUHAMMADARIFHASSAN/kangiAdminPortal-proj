-- ============================================================
--  006_seed_data.sql
--  Kangi — Seed/test data (optional)
-- ============================================================

-- ── Demo Unlock Codes ─────────────────────────────────────────
-- These codes can be redeemed in the app to unlock characters.
-- In production, generate unique codes server-side and distribute
-- them as QR/NFC tags.

insert into unlock_codes (code, character_id, character_name)
values
  ('DEMO_BEE_001',    '001D', 'Bee'),
  ('DEMO_BUNNY_002',  '002P', 'Bunny'),
  ('DEMO_CAT_003',    '003P', 'Cat'),
  ('DEMO_FOX_004',    '004P', 'Fox'),
  ('VIP_EXCLUSIVE_01','005D', 'Special Character')
on conflict (code) do nothing;


-- ── Demo Songs ────────────────────────────────────────────────
-- Pre-approved songs for testing. In production, songs start as
-- 'pending' and admins approve them via the admin dashboard.

insert into songs (title, artist, url, status)
values
  ('Demo Track 1', 'Artist A', 'https://example.com/song1.mp3', 'approved'),
  ('Demo Track 2', 'Artist B', 'https://example.com/song2.mp3', 'approved'),
  ('Pending Song', 'Artist C', 'https://example.com/song3.mp3', 'pending')
on conflict (id) do nothing;


-- ── Admin Account ─────────────────────────────────────────────
-- To mark a user as admin:
--   1. Create the account via the app (sign up)
--   2. Find the user's UUID in Supabase Dashboard → Auth → Users
--   3. Uncomment and run the UPDATE below, replacing <USER_UUID>

-- update profiles set is_admin = true
-- where id = '<USER_UUID>';


-- ── Test Notification ─────────────────────────────────────────
-- Uncomment to send a test notification to all users

-- insert into notifications (user_id, title, body, type)
-- select id, 'Welcome!', 'Thanks for joining Kangi!', 'welcome'
-- from profiles;
