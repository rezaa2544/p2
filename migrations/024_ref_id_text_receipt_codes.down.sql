-- 024_ref_id_text_receipt_codes.down.sql
-- Rollback of 024: narrow ref_id back to INTEGER on all three tables.
-- Only safe to run when every stored ref_id is a numeric literal; the
-- down chain (latest → 001) is a development/DR tool, never run blindly
-- against production data that may hold client-generated 'RC-...' codes.
-- The USING clause casts text back to integer and PostgreSQL raises
-- invalid_input_syntax for any non-numeric value, which is the intended
-- fail-closed behaviour.

BEGIN;

ALTER TABLE installments         ALTER COLUMN ref_id TYPE INTEGER USING ref_id::integer;
ALTER TABLE parent_subscriptions ALTER COLUMN ref_id TYPE INTEGER USING ref_id::integer;
ALTER TABLE subscription_payments ALTER COLUMN ref_id TYPE INTEGER USING ref_id::integer;

COMMIT;
