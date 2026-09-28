-- 024_ref_id_text_receipt_codes.sql
-- A-31-followup (bootstrap→PG seed fail-closed): the demo/client data model
-- stores payment reference codes as STRINGS — the client generates
-- 'RC-<8 digits>' for tuition installments (src/js/20-communication-finance.js
-- L56/57/839) and 'SUB-S<plan>-<id>' for parent subscriptions
-- (src/js/23-subscription.js L195/461-463) — but 001 created these columns as
-- INTEGER. The one-time bootstrap→PG seed (server/index.js seedPgFromBootstrap,
-- P0-BUG-04 guard) therefore fail-closed on an empty PostgreSQL with
-- `invalid input syntax for type integer: "RC-..."` and the boot aborted.
-- Fix: widen ref_id to VARCHAR(255) on all three tables. No FK references
-- ref_id and no server-side code treats it as numeric; existing integer
-- values (if any) are preserved as their text form.

BEGIN;

ALTER TABLE installments         ALTER COLUMN ref_id TYPE VARCHAR(255) USING ref_id::text;
ALTER TABLE parent_subscriptions ALTER COLUMN ref_id TYPE VARCHAR(255) USING ref_id::text;
ALTER TABLE subscription_payments ALTER COLUMN ref_id TYPE VARCHAR(255) USING ref_id::text;

COMMIT;
