-- ═══════════════════════════════════════════════════════════════════
-- migrations/013_universal_occ_and_sequences.sql
-- Wave 26 / Phase 5 Step 08 (P2-NI-06)
-- Universal Optimistic Concurrency Control (OCC) & Persistent Conflicts
-- Fully compatible with Migrations 001-012 (Zero-Collision Forward & Rollback)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Ensure sync_conflicts table has all required columns and indexes for persistent conflict storage
-- (Table was initially created in Migration 001; here we extend and harden it)
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id BIGSERIAL PRIMARY KEY,
  collection VARCHAR(128) NOT NULL,
  record_id BIGINT,
  school_id BIGINT,
  base_version INTEGER,
  incoming_version INTEGER,
  current_version INTEGER,
  client_data JSONB,
  server_data JSONB,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  winner VARCHAR(32),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all extended columns exist (safe for databases migrated from 001)
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS client_uid VARCHAR(128);
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS server_version INTEGER;
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS server_state JSONB;
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS incoming JSONB;
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS resolved_data JSONB;
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS resolution_strategy VARCHAR(32) DEFAULT 'server_wins';

-- Create performance indexes for persistent conflicts
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_school ON sync_conflicts (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_user ON sync_conflicts (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_coll_rec ON sync_conflicts (collection, record_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status_created ON sync_conflicts (status, created_at DESC);

-- 2. Add 'version' column to all application tables if not already present
-- and ensure atomic sequence-backed IDs
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'announcements', 'app_settings', 'assets', 'assoc_minutes', 'attendance',
    'attendance_modes', 'bell_schedules', 'bus_events', 'bus_followups', 'bus_locations',
    'bus_needs', 'bus_routes', 'bus_students', 'calendar', 'certificates',
    'class_subject_members', 'classes', 'corrections', 'counselor_msgs', 'counselor_refs',
    'counties', 'discipline', 'districts', 'dojo_types', 'donations',
    'dorm_assignments', 'dorm_meals', 'dorm_rooms', 'enrollments', 'exam_duties',
    'exam_terms', 'exams', 'grades', 'hw_assignments', 'hw_submissions',
    'installments', 'internships', 'leaves', 'lib_books', 'lib_loans',
    'makeup_classes', 'meeting_slots', 'messages', 'nid_conflicts', 'notifications',
    'notify_queue', 'nudges', 'offices', 'parent_links', 'parent_subscriptions',
    'parent_verifications', 'pre_enrollments', 'preapps', 'provinces', 'reexams',
    'report_logs', 'safety_drills', 'schedule', 'scholarships', 'school_years',
    'schools', 'sedascores', 'sms_log', 'sms_wallet', 'staff_attendance',
    'student_archive', 'student_transfers', 'subjects', 'subscription_payments', 'substitutions',
    'summer_classes', 'support_tickets', 'teacher_evaluations', 'teacher_notes', 'teacher_schools',
    'teacher_sms', 'training_courses', 'transactions', 'transfer_requests', 'tuition_plans',
    'tuitions', 'users', 'vclass_attendance', 'vclass_links', 'vclass_questions',
    'vclass_sessions', 'visitors'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'version') THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN version INTEGER NOT NULL DEFAULT 1;', tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
