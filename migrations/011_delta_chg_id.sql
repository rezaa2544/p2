-- Payesh migration 008: delta change-ID (chg_id) — Wave 10 (Database Scale), step 4
-- Immutable forward migration. Rollback: 008_delta_chg_id.down.sql
--
-- WHY: the delta pull predicates on TIMESTAMPS
--   (created_at > $since OR updated_at > $since) — clock-bound, skew-fragile
--   (phase-2 keyset tie-breakers fight the symptom, not the cause), and the
--   cursor protocol carries wall-clock `since` across restarts/regions whose
--   clocks may differ. A monotonic change-ID removes time from the equation:
--   every row version (INSERT or UPDATE) consumes one value from a shared
--   sequence; the delta feed becomes `WHERE chg_id > $watermark` — strictly
--   ordered, gap-tolerant, immune to skew and retroactive timestamp edits.
--
-- WHAT (this migration — infrastructure only, additive, zero behavior change):
--   * sequence payesh_chg_seq (shared by all tables → one global feed order)
--   * column chg_id BIGINT on the 14 per-school transactional delta tables
--     (exactly migration 005's list minus the non-transactional pair
--     schools + bell_schedules; homework/vclass tables were added to the
--     delta allowlist later and follow in their own migration when they
--     reach 005-parity)
--   * trigger BEFORE INSERT OR UPDATE per table → NEW.chg_id = nextval(...)
--     (fires on the ON CONFLICT DO UPDATE path too, so the upsert mirror
--     in server/db.js persistOp keeps working UNCHANGED)
--   * 14 plain ascending btree indexes on (chg_id) — the index the future
--     cursor-v3 delta query (`chg_id > $watermark ORDER BY chg_id, id`)
--     will scan. NOTHING queries them yet — see the honesty note below.
--
-- WHY 14 AND THESE 14: users, classes, subjects, schedule, enrollments,
--   attendance, grades, discipline, leaves, notifications, announcements,
--   hw_submissions, counselor_refs, counselor_msgs — the transactional
--   per-school tables of the delta pull (server/syncdelta.js ALLOWED ∩
--   migration 005 coverage). schools (tenant registry, tiny, rarely
--   changes) and bell_schedules (config) keep timestamp-only deltas.
--
-- SHAPE PARITY: chg_id is a SERVER-INTERNAL column. server/db.js
--   (stripInternalColumns) removes it from every row leaving the DB layer
--   (readCollection/readOne/delta reads) so the client-visible row shape is
--   byte-identical to memory mode. It never travels on the wire and never
--   enters an op payload (validate.js would reject it as unknown_field).
--
-- HONESTY NOTE (no fake green): the wire-up — cursor v3 carrying a chg_id
--   watermark, pull.js switching deltaRowsSql → deltaRowsByChgSql — is the
--   explicitly-scoped FOLLOW-UP. Until then these indexes are measured
--   schema-prep, not claimed performance. The ready-to-use query builder
--   ships in server/syncdelta.js (deltaRowsByChgSql) with unit tests.
--
-- The concurrent index-build variant is deliberately NOT used (policy of
--   004/005/007): migrations run inside a transaction and it cannot. Apply
--   by hand with the concurrent form on a production database with live
--   traffic.
BEGIN;

-- 1) Shared change sequence (BIGINT — practically inexhaustible)
CREATE SEQUENCE IF NOT EXISTS payesh_chg_seq;

-- 2) Bump function: every INSERT and every UPDATE mints a fresh change ID.
--    Deliberately bumps on no-op UPDATEs too: a missed bump loses a change
--    event (delta hole); an extra bump costs one sequence value (cheap).
--    Assignment inside a BEFORE trigger does not re-fire the trigger.
CREATE OR REPLACE FUNCTION payesh_chg_bump() RETURNS trigger AS $$
BEGIN
  NEW.chg_id := nextval('payesh_chg_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Per-table: column + idempotent trigger + backfill + index.
--    Trigger guard uses the catalog (works on every supported PG version;
--    CREATE OR REPLACE TRIGGER needs 14+).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','classes','subjects','schedule','enrollments',
    'attendance','grades','discipline','leaves','notifications',
    'announcements','hw_submissions','counselor_refs','counselor_msgs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS chg_id BIGINT', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_chg ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_chg BEFORE INSERT OR UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION payesh_chg_bump()', t, t);
  END LOOP;
END $$;

-- 4) Backfill existing rows (INSERT-trigger only fires on NEW writes).
--    One value per existing row, per table, table-by-table (batched by PG
--    itself; a very large production table should backfill in batches by
--    id range during a maintenance window — noted in WAVE10_DB_SCALE.md).
UPDATE users            SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE classes          SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE subjects         SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE schedule         SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE enrollments      SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE attendance       SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE grades           SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE discipline       SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE leaves           SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE notifications    SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE announcements    SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE hw_submissions   SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE counselor_refs   SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;
UPDATE counselor_msgs   SET chg_id = nextval('payesh_chg_seq') WHERE chg_id IS NULL;

-- 5) The 14 delta indexes (ascending — the watermark scan walks forward)
CREATE INDEX IF NOT EXISTS idx_users_chg_id            ON users            (chg_id);
CREATE INDEX IF NOT EXISTS idx_classes_chg_id          ON classes          (chg_id);
CREATE INDEX IF NOT EXISTS idx_subjects_chg_id         ON subjects         (chg_id);
CREATE INDEX IF NOT EXISTS idx_schedule_chg_id         ON schedule         (chg_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_chg_id      ON enrollments      (chg_id);
CREATE INDEX IF NOT EXISTS idx_attendance_chg_id       ON attendance       (chg_id);
CREATE INDEX IF NOT EXISTS idx_grades_chg_id           ON grades           (chg_id);
CREATE INDEX IF NOT EXISTS idx_discipline_chg_id       ON discipline       (chg_id);
CREATE INDEX IF NOT EXISTS idx_leaves_chg_id           ON leaves           (chg_id);
CREATE INDEX IF NOT EXISTS idx_notifications_chg_id    ON notifications    (chg_id);
CREATE INDEX IF NOT EXISTS idx_announcements_chg_id    ON announcements    (chg_id);
CREATE INDEX IF NOT EXISTS idx_hw_submissions_chg_id   ON hw_submissions   (chg_id);
CREATE INDEX IF NOT EXISTS idx_counselor_refs_chg_id   ON counselor_refs   (chg_id);
CREATE INDEX IF NOT EXISTS idx_counselor_msgs_chg_id   ON counselor_msgs   (chg_id);

COMMIT;
