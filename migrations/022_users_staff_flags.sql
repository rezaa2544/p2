-- 022_users_staff_flags.sql
-- A-33 (DB/Concurrency): staff-flag persistence & AuthZ across restart.
-- authz/model.json (fields.users) + write-perms allow lib_staff/asset_staff/is_head,
-- but 001..021 never created these columns: a write therefore failed at
-- persistOpWithClient with `column ... does not exist` -> P1-14 atomic rollback
-- -> sync_mirror_failed (HTTP 503); after restart the hydrated store could not
-- restore the flags and policy.js gates (E.4/E.5/head) failed closed (deny).
-- Fix: add the three columns (integer, NULL = flag unset = deny everywhere).

ALTER TABLE users ADD COLUMN IF NOT EXISTS lib_staff integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS asset_staff integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_head integer;
