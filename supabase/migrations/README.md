# Kangi — Supabase Migrations

Run these files **in order** in the Supabase Dashboard → SQL Editor.

| File | What it does |
|---|---|
| `001_initial_schema.sql` | Creates all tables + indexes |
| `002_rls_policies.sql` | Enables Row Level Security on every table |
| `003_triggers.sql` | Auto-creates profile rows on signup; keeps like/share/comment counts in sync |
| `004_functions.sql` | Server-side RPC functions (redeem code, ban/unban, notifications) |
| `005_storage.sql` | Creates storage buckets (avatars, videos, covers) + access policies |
| `006_seed_data.sql` | Demo unlock codes, demo songs, admin setup instructions |
| `007_support_messages.sql` | support_messages table + reply function; `is_premium` + `settings` columns; `qr_codes` & `songs` storage buckets |
| `008_security_columns.sql` | Locks admin/banned/premium columns (no client self-grant); admin RPCs `set_admin_status` / `set_premium_status`; public read of profile display name + avatar |
| `009_songs_full_columns.sql` | Extends `songs` with modes/trim/uploader fields + `songs` audio storage bucket |
| `016_admin_actions_server_guard.sql` | Server-side guard: only a non-banned admin can make admin / premium / ban / unban (trigger on `profiles` + hardened RPCs + `am_i_admin()` for dashboard login); removes `register_as_admin` |
| `017_unlock_codes_serial_redeem_url.sql` | Adds missing `serial` + `redeem_url` columns to `unlock_codes` (fixes TCG/QR batch publish error) |
| `018_admin_list_users.sql` | Admin-only `admin_list_users()` RPC (emails + last sign-in) — replaces the `admin_users` view that returned 403 |

## How to run

1. Go to [bfqwlcjflbybhltiflkt.supabase.co](https://supabase.com/dashboard/project/bfqwlcjflbybhltiflkt)
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Paste the contents of each file, run in order `001` → `009`

## After running

- Go to **Storage** and confirm buckets `avatars`, `videos`, `covers` were created
- Go to **Database → Tables** and confirm all 8 tables exist
- Go to **Database → Functions** and confirm `redeem_character_code`, `ban_user`, `send_notification` etc. are listed
- Sign up a test account in the app → check that a row appears in the `profiles` table automatically (trigger test)
