-- 022_users_staff_flags.down.sql
-- N-14: the forward migration shipped without a rollback file, so the CI
-- "latest → 001" rollback step died immediately with MIGRATION_DOWN_FILE_MISSING
-- and migrate-helper --check reported "بدونِ فایلِ برگشت". Reversing 022 drops
-- the three staff flags it added; NULL = flag unset = deny everywhere, so their
-- removal restores the pre-022 state exactly (policy.js gates fail closed).

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS lib_staff;
ALTER TABLE users DROP COLUMN IF EXISTS asset_staff;
ALTER TABLE users DROP COLUMN IF EXISTS is_head;

COMMIT;
