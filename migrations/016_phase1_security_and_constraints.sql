BEGIN;

-- 1. Soft Delete columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE parent_links ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE grades ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE discipline ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Scope & Performance Indexes (Tenant, User, Query Scope)
CREATE INDEX IF NOT EXISTS idx_users_school_role ON users (school_id, role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);

CREATE INDEX IF NOT EXISTS idx_classes_school_deleted ON classes (school_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_student_year ON enrollments (student_id, academic_year_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_school_year ON enrollments (school_id, academic_year_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_parent_links_student ON parent_links (student_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_links_parent ON parent_links (parent_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grades_school_student ON grades (school_id, student_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grades_school_subject ON grades (school_id, subject_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_school_student_date ON attendance (school_id, student_id, date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_school_status_created ON sync_conflicts (school_id, status, created_at);

-- 3. Partial Unique Constraints (WHERE deleted_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_active ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_national_id_active ON users (national_id) WHERE deleted_at IS NULL AND national_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_student_year_active ON enrollments (student_id, academic_year_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_links_student_parent_active ON parent_links (student_id, parent_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_school_name_active ON classes (school_id, name) WHERE deleted_at IS NULL;

COMMIT;
