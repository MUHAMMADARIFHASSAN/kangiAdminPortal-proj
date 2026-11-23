-- ============================================================
--  017_unlock_codes_serial_redeem_url.sql
--  Fix: "Could not find the 'redeem_url' column of 'unlock_codes'
--  in the schema cache" when publishing a TCG/QR batch.
--
--  Live DB has unlock_codes.batch_id but is missing the two other
--  columns that 012_tcg_batches.sql adds. The dashboard
--  (service.js → publishNft / getNfts) writes and reads both.
--
--  Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
-- ============================================================

alter table public.unlock_codes
  add column if not exists serial     text,
  add column if not exists redeem_url text;

-- Make PostgREST pick up the new columns immediately
notify pgrst, 'reload schema';
