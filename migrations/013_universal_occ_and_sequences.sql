-- ═══════════════════════════════════════════════════════════════════
-- migrations/013_universal_occ_and_sequences.sql
-- Wave 26 / Phase 5 Step 08 (P2-NI-06)
-- Universal Optimistic Concurrency Control (OCC) & Persistent Conflicts
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create persistent sync_conflicts table (Single Source of Truth in PostgreSQL)
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id BIGSERIAL PRIMARY KEY,
  client_uid VARCHAR(128),
  collection VARCHAR(64) NOT NULL,
  record_id BIGINT,
  user_id BIGINT,
  school_id BIGINT,
  base_version INT,
  server_version INT,
  client_data JSONB,
  server_data JSONB,
  resolved_data JSONB,
  resolution_strategy VARCHAR(32) NOT NULL DEFAULT 'server_wins',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_school ON sync_conflicts (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_user ON sync_conflicts (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_coll_rec ON sync_conflicts (collection, record_id);

-- 2. Add 'version' column to all application tables if not already present
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
