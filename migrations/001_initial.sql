-- Migration 001: initial schema (tables + extensions)
-- GENERATED from authz/model.json via tools/migrate-to-pg.js — FROZEN, do not edit.
-- New changes go in new migration files.

-- Up Migration

-- ═══════════════════════════════════════════════════════════════════
-- Payesh PostgreSQL Relational Schema (80 Collections)
-- Auto-generated from authz/model.json
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Internal synchronization & session management tables
CREATE TABLE IF NOT EXISTS server_processed_uids (
  uid VARCHAR(128) PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_revoked_jti (
  jti VARCHAR(128) PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_auth_codes (
  phone VARCHAR(20) PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  national_id VARCHAR(10),
  user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: schools
CREATE TABLE IF NOT EXISTS schools (
  "active" BOOLEAN,
  "address" VARCHAR(255),
  "area_kind" VARCHAR(255),
  "boom_goals" VARCHAR(255),
  "branches" VARCHAR(255),
  "capabilities" JSONB,
  "capacity" INTEGER,
  "city" VARCHAR(255),
  "code" VARCHAR(255),
  "county_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "district_id" INTEGER,
  "fields" VARCHAR(255),
  "gender" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "landline" VARCHAR(255),
  "level" VARCHAR(255),
  "name" VARCHAR(255),
  "notify_rules" VARCHAR(255),
  "organization_id" INTEGER,
  "phone" VARCHAR(20),
  "place_rules" VARCHAR(255),
  "province_id" INTEGER,
  "shift" VARCHAR(255),
  "type" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  "work_days" VARCHAR(255)
);
-- Table: announcements
CREATE TABLE IF NOT EXISTS announcements (
  "audience" VARCHAR(255),
  "author_id" INTEGER,
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "pinned" VARCHAR(255),
  "school_id" INTEGER,
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_announcements_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  "id" INTEGER PRIMARY KEY,
  "created_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ
);


-- Table: assets
CREATE TABLE IF NOT EXISTS assets (
  "category" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "location" VARCHAR(255),
  "name" VARCHAR(255),
  "note" TEXT,
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_assets_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: assoc_minutes
CREATE TABLE IF NOT EXISTS assoc_minutes (
  "archived" VARCHAR(255),
  "attendees" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "meeting_date" VARCHAR(50),
  "meeting_type" VARCHAR(255),
  "resolutions" VARCHAR(255),
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_assoc_minutes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: attendance
CREATE TABLE IF NOT EXISTS attendance (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "exit_at" TIMESTAMPTZ,
  "exit_minutes" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "late_at" TIMESTAMPTZ,
  "late_minutes" VARCHAR(255),
  "note" TEXT,
  "school_id" INTEGER,
  "source" VARCHAR(255),
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "taken_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_attendance_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: attendance_modes
CREATE TABLE IF NOT EXISTS attendance_modes (
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "mode" VARCHAR(255),
  "school_id" INTEGER,
  "set_at" TIMESTAMPTZ,
  "set_by" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_attendance_modes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: bell_schedules
CREATE TABLE IF NOT EXISTS bell_schedules (
  "created_at" TIMESTAMPTZ,
  "days" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_bell_schedules_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: bus_events
CREATE TABLE IF NOT EXISTS bus_events (
  "at" TIMESTAMPTZ,
  "by" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "route_id" INTEGER,
  "school_id" INTEGER,
  "source" VARCHAR(255),
  "student_id" INTEGER,
  "type" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_bus_events_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: bus_followups
CREATE TABLE IF NOT EXISTS bus_followups (
  "close_note" VARCHAR(255),
  "closed_at" TIMESTAMPTZ,
  "closed_by" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "route_id" INTEGER,
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_bus_followups_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: bus_locations
CREATE TABLE IF NOT EXISTS bus_locations (
  "acc" VARCHAR(255),
  "by" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "lat" VARCHAR(255),
  "lng" VARCHAR(255),
  "off" VARCHAR(255),
  "pos" VARCHAR(255),
  "recorded_at" TIMESTAMPTZ,
  "route_id" INTEGER,
  "source" VARCHAR(255),
  "speed" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: bus_needs
CREATE TABLE IF NOT EXISTS bus_needs (
  "answer" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "school_id" INTEGER,
  "set_at" TIMESTAMPTZ,
  "set_by" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_bus_needs_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: bus_routes
CREATE TABLE IF NOT EXISTS bus_routes (
  "created_at" TIMESTAMPTZ,
  "driver_id" INTEGER,
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "points" VARCHAR(255),
  "school_id" INTEGER,
  "stops" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_bus_routes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: bus_students
CREATE TABLE IF NOT EXISTS bus_students (
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "route_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: calendar
CREATE TABLE IF NOT EXISTS calendar (
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "kind" VARCHAR(255),
  "school_id" INTEGER,
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_calendar_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: certificates
CREATE TABLE IF NOT EXISTS certificates (
  "id" INTEGER PRIMARY KEY,
  "code" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "issued_at" TIMESTAMPTZ,
  "issued_by" VARCHAR(255),
  "school_id" INTEGER,
  "student_id" INTEGER,
  "type" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  "year" INTEGER,
  CONSTRAINT fk_certificates_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: class_subject_members
CREATE TABLE IF NOT EXISTS class_subject_members (
  "id" INTEGER PRIMARY KEY,
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "student_id" INTEGER,
  "subject_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: classes
CREATE TABLE IF NOT EXISTS classes (
  "capacity" INTEGER,
  "class_mode" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "field" VARCHAR(255),
  "grade" INTEGER,
  "grade_level" VARCHAR(255),
  "homeroom_teacher_id" INTEGER,
  "id" INTEGER PRIMARY KEY,
  "mode" VARCHAR(255),
  "name" VARCHAR(255),
  "room" VARCHAR(255),
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_classes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: corrections
CREATE TABLE IF NOT EXISTS corrections (
  "id" INTEGER PRIMARY KEY,
  "created_at" TIMESTAMPTZ,
  "message" VARCHAR(255),
  "parent_id" INTEGER,
  "parent_nid" VARCHAR(255),
  "resolved_at" TIMESTAMPTZ,
  "response" VARCHAR(255),
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_corrections_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: counselor_msgs
CREATE TABLE IF NOT EXISTS counselor_msgs (
  "author_id" INTEGER,
  "author_role" VARCHAR(255),
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_counselor_msgs_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: counselor_refs
CREATE TABLE IF NOT EXISTS counselor_refs (
  "breach_key" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "handled_at" TIMESTAMPTZ,
  "handled_by" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "pattern" VARCHAR(255),
  "reason" VARCHAR(255),
  "referred_at" TIMESTAMPTZ,
  "referred_by" VARCHAR(255),
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_counselor_refs_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: counties
CREATE TABLE IF NOT EXISTS counties (
  "code" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "province_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: discipline
CREATE TABLE IF NOT EXISTS discipline (
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "date" VARCHAR(50),
  "description" TEXT,
  "id" INTEGER PRIMARY KEY,
  "kind" VARCHAR(255),
  "points" VARCHAR(255),
  "school_id" INTEGER,
  "student_id" INTEGER,
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_discipline_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: districts
CREATE TABLE IF NOT EXISTS districts (
  "county_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "kind" VARCHAR(255),
  "name" VARCHAR(255),
  "province_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "village" VARCHAR(255)
);


-- Table: dojo_types
CREATE TABLE IF NOT EXISTS dojo_types (
  "id" INTEGER PRIMARY KEY,
  "created_at" TIMESTAMPTZ,
  "delta" VARCHAR(255),
  "icon" VARCHAR(255),
  "label" VARCHAR(255),
  "order" VARCHAR(255),
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_dojo_types_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: dorm_assignments
CREATE TABLE IF NOT EXISTS dorm_assignments (
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "room_id" INTEGER,
  "school_id" INTEGER,
  "since" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_dorm_assignments_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: dorm_meals
CREATE TABLE IF NOT EXISTS dorm_meals (
  "created_at" TIMESTAMPTZ,
  "day" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "kind" VARCHAR(255),
  "menu" VARCHAR(255),
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_dorm_meals_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: dorm_rooms
CREATE TABLE IF NOT EXISTS dorm_rooms (
  "capacity" INTEGER,
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_dorm_rooms_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "school_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "year" INTEGER,
  CONSTRAINT fk_enrollments_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: exam_duties
CREATE TABLE IF NOT EXISTS exam_duties (
  "created_at" TIMESTAMPTZ,
  "exam_id" INTEGER,
  "id" INTEGER PRIMARY KEY,
  "role" VARCHAR(255),
  "school_id" INTEGER,
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_exam_duties_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: exam_terms
CREATE TABLE IF NOT EXISTS exam_terms (
  "created_at" TIMESTAMPTZ,
  "end_date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "school_id" INTEGER,
  "start_date" VARCHAR(50),
  "status" VARCHAR(255),
  "term" VARCHAR(255),
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_exam_terms_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: exams
CREATE TABLE IF NOT EXISTS exams (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "duration" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "max_score" VARCHAR(255),
  "room" VARCHAR(255),
  "school_id" INTEGER,
  "source" VARCHAR(255),
  "start_time" VARCHAR(255),
  "subject_id" INTEGER,
  "term_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_exams_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: grades
CREATE TABLE IF NOT EXISTS grades (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "exam_type" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "kind" VARCHAR(255),
  "max_score" VARCHAR(255),
  "school_id" INTEGER,
  "score" NUMERIC(12, 2),
  "source" VARCHAR(255),
  "student_id" INTEGER,
  "subject_id" INTEGER,
  "teacher_id" INTEGER,
  "term" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_grades_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: hw_assignments
CREATE TABLE IF NOT EXISTS hw_assignments (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "description" TEXT,
  "due_date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "locked" VARCHAR(255),
  "school_id" INTEGER,
  "subject_id" INTEGER,
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  "window_close" VARCHAR(255),
  "window_open" VARCHAR(255),
  CONSTRAINT fk_hw_assignments_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: hw_submissions
CREATE TABLE IF NOT EXISTS hw_submissions (
  "annotated_key" VARCHAR(255),
  "assignment_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "file_key" VARCHAR(255),
  "file_name" VARCHAR(255),
  "graded_at" TIMESTAMPTZ,
  "graded_by" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "mime" VARCHAR(255),
  "score" NUMERIC(12, 2),
  "size" VARCHAR(255),
  "student_id" INTEGER,
  "submitted_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ
);


-- Table: installments
CREATE TABLE IF NOT EXISTS installments (
  "amount" NUMERIC(12, 2),
  "created_at" TIMESTAMPTZ,
  "due" VARCHAR(255),
  "due_date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "method" VARCHAR(255),
  "paid" VARCHAR(255),
  "paid_amount" VARCHAR(255),
  "paid_at" TIMESTAMPTZ,
  "ref_id" INTEGER,
  "reminded_at" TIMESTAMPTZ,
  "school_id" INTEGER,
  "seq" VARCHAR(255),
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "tuition_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_installments_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: internships
CREATE TABLE IF NOT EXISTS internships (
  "approved_at" TIMESTAMPTZ,
  "approved_by" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "date" VARCHAR(50),
  "hours" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "location" VARCHAR(255),
  "note" TEXT,
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_internships_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: leaves
CREATE TABLE IF NOT EXISTS leaves (
  "created_at" TIMESTAMPTZ,
  "from_date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "kind" VARCHAR(255),
  "reason" VARCHAR(255),
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "to_date" VARCHAR(50),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_leaves_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: lib_books
CREATE TABLE IF NOT EXISTS lib_books (
  "author" VARCHAR(255),
  "code" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "school_id" INTEGER,
  "serial" VARCHAR(255),
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_lib_books_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: lib_loans
CREATE TABLE IF NOT EXISTS lib_loans (
  "book_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "due_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "loan_at" TIMESTAMPTZ,
  "registered_by" VARCHAR(255),
  "returned_at" TIMESTAMPTZ,
  "school_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_lib_loans_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: makeup_classes
CREATE TABLE IF NOT EXISTS makeup_classes (
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_makeup_classes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: meeting_slots
CREATE TABLE IF NOT EXISTS meeting_slots (
  "booked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "duration" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "location" VARCHAR(255),
  "note" TEXT,
  "parent_id" INTEGER,
  "school_id" INTEGER,
  "start_time" VARCHAR(255),
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_meeting_slots_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: messages
CREATE TABLE IF NOT EXISTS messages (
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "from_id" INTEGER,
  "id" INTEGER PRIMARY KEY,
  "school_id" INTEGER,
  "to_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_messages_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: nid_conflicts
CREATE TABLE IF NOT EXISTS nid_conflicts (
  "id" INTEGER PRIMARY KEY,
  "created_at" TIMESTAMPTZ,
  "full_name" VARCHAR(255),
  "national_id" VARCHAR(10),
  "other_school_id" INTEGER,
  "other_student_id" INTEGER,
  "school_id" INTEGER,
  "source" VARCHAR(255),
  "status" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_nid_conflicts_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: notifications
CREATE TABLE IF NOT EXISTS notifications (
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "link" VARCHAR(255),
  "read" INTEGER,
  "ref" VARCHAR(255),
  "role" VARCHAR(255),
  "school_id" INTEGER,
  "title" VARCHAR(255),
  "type" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  "user_id" INTEGER,
  CONSTRAINT fk_notifications_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: notify_queue
CREATE TABLE IF NOT EXISTS notify_queue (
  "auto" VARCHAR(255),
  "body" TEXT,
  "class_id" INTEGER,
  "correction_of" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "decided_at" TIMESTAMPTZ,
  "decided_by" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "kind" VARCHAR(255),
  "parent_ids" VARCHAR(255),
  "parts" VARCHAR(255),
  "school_id" INTEGER,
  "source_hash" VARCHAR(255),
  "source_ref" VARCHAR(255),
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_notify_queue_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: nudges
CREATE TABLE IF NOT EXISTS nudges (
  "id" INTEGER PRIMARY KEY,
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "date" VARCHAR(50),
  "period" VARCHAR(255),
  "replied_at" TIMESTAMPTZ,
  "reply" VARCHAR(255),
  "school_id" INTEGER,
  "sms_sent" VARCHAR(255),
  "status" VARCHAR(255),
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_nudges_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: offices
CREATE TABLE IF NOT EXISTS offices (
  "active" BOOLEAN,
  "county_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "district_id" INTEGER,
  "id" INTEGER PRIMARY KEY,
  "level" VARCHAR(255),
  "name" VARCHAR(255),
  "province_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "user_id" INTEGER
);


-- Table: parent_links
CREATE TABLE IF NOT EXISTS parent_links (
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "parent_id" INTEGER,
  "relation" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: parent_subscriptions
CREATE TABLE IF NOT EXISTS parent_subscriptions (
  "amount" NUMERIC(12, 2),
  "created_at" TIMESTAMPTZ,
  "end_date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "paid_at" TIMESTAMPTZ,
  "plan" VARCHAR(255),
  "ref_id" INTEGER,
  "start_date" VARCHAR(50),
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "user_id" INTEGER
);


-- Table: parent_verifications
CREATE TABLE IF NOT EXISTS parent_verifications (
  "confirmed" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "parent_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: pre_enrollments
CREATE TABLE IF NOT EXISTS pre_enrollments (
  "created_at" TIMESTAMPTZ,
  "field" VARCHAR(255),
  "full_name" VARCHAR(255),
  "grade" INTEGER,
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "national_id" VARCHAR(10),
  "note" TEXT,
  "phone" VARCHAR(20),
  "school_id" INTEGER,
  "source" VARCHAR(255),
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "year_code" VARCHAR(255),
  CONSTRAINT fk_pre_enrollments_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: preapps
CREATE TABLE IF NOT EXISTS preapps (
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "note" TEXT,
  "phone" VARCHAR(20),
  "school_id" INTEGER,
  "stage" VARCHAR(255),
  "stage_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_preapps_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: provinces
CREATE TABLE IF NOT EXISTS provinces (
  "code" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "updated_at" TIMESTAMPTZ
);


-- Table: reexams
CREATE TABLE IF NOT EXISTS reexams (
  "created_at" TIMESTAMPTZ,
  "exam_date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "new_score" VARCHAR(255),
  "original_score" VARCHAR(255),
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "subject_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_reexams_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: schedule
CREATE TABLE IF NOT EXISTS schedule (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "day" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "period" VARCHAR(255),
  "school_id" INTEGER,
  "subject_id" INTEGER,
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_schedule_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: scholarships
CREATE TABLE IF NOT EXISTS scholarships (
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_scholarships_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: school_years
CREATE TABLE IF NOT EXISTS school_years (
  "id" INTEGER PRIMARY KEY,
  "created_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ
);




-- Table: sedascores
CREATE TABLE IF NOT EXISTS sedascores (
  "created_at" TIMESTAMPTZ,
  "entered_by" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "note" TEXT,
  "school_id" INTEGER,
  "score" NUMERIC(12, 2),
  "student_id" INTEGER,
  "subject_id" INTEGER,
  "term" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_sedascores_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: sms_log
CREATE TABLE IF NOT EXISTS sms_log (
  "id" INTEGER PRIMARY KEY,
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "parts" VARCHAR(255),
  "phone" VARCHAR(20),
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  "user_id" INTEGER,
  CONSTRAINT fk_sms_log_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: sms_wallet
CREATE TABLE IF NOT EXISTS sms_wallet (
  "balance" NUMERIC(12, 2),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_sms_wallet_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: student_archive
CREATE TABLE IF NOT EXISTS student_archive (
  "id" INTEGER PRIMARY KEY,
  "archived_at" TIMESTAMPTZ,
  "attendance_rate" VARCHAR(255),
  "avg_score" VARCHAR(255),
  "class_name" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "discipline_points" VARCHAR(255),
  "field" VARCHAR(255),
  "full_name" VARCHAR(255),
  "grade_level" VARCHAR(255),
  "name" VARCHAR(255),
  "national_id" VARCHAR(10),
  "school_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "year_code" VARCHAR(255),
  CONSTRAINT fk_student_archive_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: student_transfers
CREATE TABLE IF NOT EXISTS student_transfers (
  "id" INTEGER PRIMARY KEY,
  "created_at" TIMESTAMPTZ,
  "from_grade" VARCHAR(255),
  "from_school_id" INTEGER,
  "moved_attendance" VARCHAR(255),
  "moved_discipline" VARCHAR(255),
  "moved_grades" VARCHAR(255),
  "reason" VARCHAR(255),
  "student_id" INTEGER,
  "to_grade" VARCHAR(255),
  "to_school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "year_code" VARCHAR(255)
);


-- Table: subjects
CREATE TABLE IF NOT EXISTS subjects (
  "code" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "field" VARCHAR(255),
  "grade" INTEGER,
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "weekly_hours" VARCHAR(255),
  CONSTRAINT fk_subjects_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: subscription_payments
CREATE TABLE IF NOT EXISTS subscription_payments (
  "id" INTEGER PRIMARY KEY,
  "amount" NUMERIC(12, 2),
  "created_at" TIMESTAMPTZ,
  "method" VARCHAR(255),
  "months" VARCHAR(255),
  "paid_at" TIMESTAMPTZ,
  "plan" VARCHAR(255),
  "ref_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "user_id" INTEGER
);


-- Table: substitutions
CREATE TABLE IF NOT EXISTS substitutions (
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "schedule_id" INTEGER,
  "school_id" INTEGER,
  "sub_teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_substitutions_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: summer_classes
CREATE TABLE IF NOT EXISTS summer_classes (
  "created_at" TIMESTAMPTZ,
  "end_date" VARCHAR(50),
  "id" INTEGER PRIMARY KEY,
  "name" VARCHAR(255),
  "note" TEXT,
  "school_id" INTEGER,
  "start_date" VARCHAR(50),
  "student_ids" VARCHAR(255),
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_summer_classes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  "created_at" TIMESTAMPTZ,
  "description" TEXT,
  "id" INTEGER PRIMARY KEY,
  "priority" VARCHAR(255),
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_support_tickets_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: teacher_notes
CREATE TABLE IF NOT EXISTS teacher_notes (
  "id" INTEGER PRIMARY KEY,
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "school_id" INTEGER,
  "student_id" INTEGER,
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_teacher_notes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: teacher_schools
CREATE TABLE IF NOT EXISTS teacher_schools (
  "active" BOOLEAN,
  "created_at" TIMESTAMPTZ,
  "employment" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "school_id" INTEGER,
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  "weekly_quota" VARCHAR(255),
  CONSTRAINT fk_teacher_schools_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: teacher_sms
CREATE TABLE IF NOT EXISTS teacher_sms (
  "id" INTEGER PRIMARY KEY,
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "phone" VARCHAR(20),
  "school_id" INTEGER,
  "source_ref" VARCHAR(255),
  "status" VARCHAR(255),
  "teacher_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_teacher_sms_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: transactions
CREATE TABLE IF NOT EXISTS transactions (
  "amount" NUMERIC(12, 2),
  "by" VARCHAR(255),
  "category" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "date" VARCHAR(50),
  "description" TEXT,
  "id" INTEGER PRIMARY KEY,
  "installment_id" INTEGER,
  "kind" VARCHAR(255),
  "school_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_transactions_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: transfer_requests
CREATE TABLE IF NOT EXISTS transfer_requests (
  "id" INTEGER PRIMARY KEY,
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "from_school_id" INTEGER,
  "national_id" VARCHAR(10),
  "note" TEXT,
  "requested_by" VARCHAR(255),
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "to_school_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: tuition_plans
CREATE TABLE IF NOT EXISTS tuition_plans (
  "active" BOOLEAN,
  "amount" NUMERIC(12, 2),
  "created_at" TIMESTAMPTZ,
  "first_due" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "installments" VARCHAR(255),
  "interval_days" VARCHAR(255),
  "school_id" INTEGER,
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_tuition_plans_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: tuitions
CREATE TABLE IF NOT EXISTS tuitions (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "discount" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "paid" VARCHAR(255),
  "payable" VARCHAR(255),
  "plan_id" INTEGER,
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "student_id" INTEGER,
  "total" NUMERIC(12, 2),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_tuitions_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: users
CREATE TABLE IF NOT EXISTS users (
  "active" BOOLEAN,
  "birth_date" VARCHAR(50),
  "created_at" TIMESTAMPTZ,
  "degree" VARCHAR(255),
  "dropped_out_at" TIMESTAMPTZ,
  "dropped_out_by" VARCHAR(255),
  "dropped_out_note" VARCHAR(255),
  "dropped_out_reason" VARCHAR(255),
  "father_nid" VARCHAR(10),
  "field" VARCHAR(255),
  "full_name" VARCHAR(255),
  "gender" VARCHAR(255),
  "grade_level" VARCHAR(255),
  "graduated_year" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "iep_notes" TEXT,
  "iep_staff" VARCHAR(255),
  "iep_updated" VARCHAR(255),
  "job" VARCHAR(255),
  "mother_nid" VARCHAR(10),
  "national_id" VARCHAR(10),
  "office_id" INTEGER,
  "phone" VARCHAR(20),
  "returned_at" TIMESTAMPTZ,
  "returned_by" VARCHAR(255),
  "role" VARCHAR(255),
  "school_id" INTEGER,
  "status" VARCHAR(255),
  "subject" VARCHAR(255),
  "subject_id" INTEGER,
  "title" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  "username" VARCHAR(255),
  CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: vclass_attendance
CREATE TABLE IF NOT EXISTS vclass_attendance (
  "by" VARCHAR(255),
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "joined_at" TIMESTAMPTZ,
  "left_at" TIMESTAMPTZ,
  "session_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: vclass_links
CREATE TABLE IF NOT EXISTS vclass_links (
  "id" INTEGER PRIMARY KEY,
  "created_at" TIMESTAMPTZ,
  "session_id" INTEGER,
  "student_id" INTEGER,
  "token" VARCHAR(255),
  "updated_at" TIMESTAMPTZ
);


-- Table: vclass_questions
CREATE TABLE IF NOT EXISTS vclass_questions (
  "answer" VARCHAR(255),
  "answered_at" TIMESTAMPTZ,
  "answered_by" VARCHAR(255),
  "body" TEXT,
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "session_id" INTEGER,
  "student_id" INTEGER,
  "updated_at" TIMESTAMPTZ
);


-- Table: vclass_sessions
CREATE TABLE IF NOT EXISTS vclass_sessions (
  "class_id" INTEGER,
  "created_at" TIMESTAMPTZ,
  "created_by" VARCHAR(255),
  "description" TEXT,
  "file_key" VARCHAR(255),
  "file_name" VARCHAR(255),
  "id" INTEGER PRIMARY KEY,
  "mime" VARCHAR(255),
  "school_id" INTEGER,
  "shad_time" VARCHAR(255),
  "shad_url" VARCHAR(255),
  "size" VARCHAR(255),
  "title" VARCHAR(255),
  "type" VARCHAR(255),
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_vclass_sessions_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Table: visitors
CREATE TABLE IF NOT EXISTS visitors (
  "created_at" TIMESTAMPTZ,
  "id" INTEGER PRIMARY KEY,
  "in_at" TIMESTAMPTZ,
  "name" VARCHAR(255),
  "out_at" TIMESTAMPTZ,
  "purpose" VARCHAR(255),
  "registered_by" VARCHAR(255),
  "school_id" INTEGER,
  "updated_at" TIMESTAMPTZ,
  CONSTRAINT fk_visitors_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);


-- Specialized Performance Composite Indexes


-- Down Migration

DROP TABLE IF EXISTS visitors;
DROP TABLE IF EXISTS vclass_sessions;
DROP TABLE IF EXISTS vclass_questions;
DROP TABLE IF EXISTS vclass_links;
DROP TABLE IF EXISTS vclass_attendance;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tuitions;
DROP TABLE IF EXISTS tuition_plans;
DROP TABLE IF EXISTS transfer_requests;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS teacher_sms;
DROP TABLE IF EXISTS teacher_schools;
DROP TABLE IF EXISTS teacher_notes;
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS summer_classes;
DROP TABLE IF EXISTS substitutions;
DROP TABLE IF EXISTS subscription_payments;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS student_transfers;
DROP TABLE IF EXISTS student_archive;
DROP TABLE IF EXISTS sms_wallet;
DROP TABLE IF EXISTS sms_log;
DROP TABLE IF EXISTS sedascores;
DROP TABLE IF EXISTS school_years;
DROP TABLE IF EXISTS scholarships;
DROP TABLE IF EXISTS schedule;
DROP TABLE IF EXISTS reexams;
DROP TABLE IF EXISTS provinces;
DROP TABLE IF EXISTS preapps;
DROP TABLE IF EXISTS pre_enrollments;
DROP TABLE IF EXISTS parent_verifications;
DROP TABLE IF EXISTS parent_subscriptions;
DROP TABLE IF EXISTS parent_links;
DROP TABLE IF EXISTS offices;
DROP TABLE IF EXISTS nudges;
DROP TABLE IF EXISTS notify_queue;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS nid_conflicts;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS meeting_slots;
DROP TABLE IF EXISTS makeup_classes;
DROP TABLE IF EXISTS lib_loans;
DROP TABLE IF EXISTS lib_books;
DROP TABLE IF EXISTS leaves;
DROP TABLE IF EXISTS internships;
DROP TABLE IF EXISTS installments;
DROP TABLE IF EXISTS hw_submissions;
DROP TABLE IF EXISTS hw_assignments;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS exam_terms;
DROP TABLE IF EXISTS exam_duties;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS dorm_rooms;
DROP TABLE IF EXISTS dorm_meals;
DROP TABLE IF EXISTS dorm_assignments;
DROP TABLE IF EXISTS dojo_types;
DROP TABLE IF EXISTS districts;
DROP TABLE IF EXISTS discipline;
DROP TABLE IF EXISTS counties;
DROP TABLE IF EXISTS counselor_refs;
DROP TABLE IF EXISTS counselor_msgs;
DROP TABLE IF EXISTS corrections;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS class_subject_members;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS calendar;
DROP TABLE IF EXISTS bus_students;
DROP TABLE IF EXISTS bus_routes;
DROP TABLE IF EXISTS bus_needs;
DROP TABLE IF EXISTS bus_locations;
DROP TABLE IF EXISTS bus_followups;
DROP TABLE IF EXISTS bus_events;
DROP TABLE IF EXISTS bell_schedules;
DROP TABLE IF EXISTS attendance_modes;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS assoc_minutes;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS schools;
DROP TABLE IF EXISTS server_auth_codes;
DROP TABLE IF EXISTS server_revoked_jti;
DROP TABLE IF EXISTS server_processed_uids;
