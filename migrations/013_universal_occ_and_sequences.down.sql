-- ═══════════════════════════════════════════════════════════════════
-- migrations/013_universal_occ_and_sequences.down.sql
-- Rollback for Wave 26 Universal OCC & Persistent Conflicts
-- Clean rollback without dropping pre-existing Migration 001 tables
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop indexes and extended columns added in Migration 013
DROP INDEX IF EXISTS idx_sync_conflicts_school;
DROP INDEX IF EXISTS idx_sync_conflicts_user;
DROP INDEX IF EXISTS idx_sync_conflicts_coll_rec;
DROP INDEX IF EXISTS idx_sync_conflicts_status_created;

ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS user_id;
ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS client_uid;
ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS server_version;
ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS server_state;
ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS incoming;
ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS resolved_data;
ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS resolution_strategy;

-- 2. Drop version columns added in Migration 013
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
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'version') THEN
        EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS version;', tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
