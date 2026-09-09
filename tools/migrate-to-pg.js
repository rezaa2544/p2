#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/migrate-to-pg.js — PostgreSQL Data Migration & DDL Generator
   -------------------------------------------------------------------
   Phase 2: Migration from server/data/payesh.json to PostgreSQL
   - Maps all 80 collections from authz/model.json to relational tables.
   - Generates production-grade DDL schema with constraints & indexes.
   - Converts JSON store records into parameterized bulk SQL inserts.
   - Direct execution mode with PostgreSQL pg.Pool if DATABASE_URL is set.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const MODEL_FILE = path.join(ROOT_DIR, 'authz', 'model.json');
const STORE_FILE = process.env.PAYESH_STORE || path.join(ROOT_DIR, 'server', 'data', 'payesh.json');
const SCHEMA_FILE = path.join(ROOT_DIR, 'server', 'schema.sql');

/* Load Data Model */
if (!fs.existsSync(MODEL_FILE)) {
  console.error('Error: authz/model.json not found at ' + MODEL_FILE);
  process.exit(1);
}
const model = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
const collections = model.collections || {};
const VERSION_TRACKED = { grades: 1, attendance: 1, discipline: 1, schools: 1, classes: 1, subjects: 1, users: 1, enrollments: 1, schedule: 1 };
function managedFields(col, fields) {
  const out = (fields || []).slice();
  if (VERSION_TRACKED[col]) {
    if (!out.includes('version')) out.push('version');
    if (!out.includes('version_vector')) out.push('version_vector');
  }
  return out;
}

/* Infer optimal column types for PostgreSQL */
function getColumnType(colName, fieldName, sampleVal) {
  if (fieldName === 'id') return 'INTEGER PRIMARY KEY';
  /* Devin-R2/R3: استثناهای مدل داده (پارامتر colName تا امروز استفاده نمی‌شد) —
     yearCode رشتهٔ «۱۴۰۴-۱۴۰۵» می‌سازد پس year گواهی VARCHAR است؛
     سقف اعتبارسنجی مبلغ کمک (۱۰^۱۰) در NUMERIC(12,2) جا نمی‌شود. */
  if (colName === 'certificates' && fieldName === 'year') return 'VARCHAR(50)';
  if (colName === 'donations' && fieldName === 'amount') return 'NUMERIC(14, 2)';
  if (colName === 'training_courses' && fieldName === 'hours') return 'INTEGER';
  if (colName === 'safety_drills' && (fieldName === 'participant_count_staff' || fieldName === 'participant_count_students')) return 'INTEGER';
  if (fieldName === 'national_id' || fieldName === 'father_nid' || fieldName === 'mother_nid') return 'VARCHAR(10)';
  if (fieldName === 'phone' || fieldName === 'mobile' || fieldName === 'tel') return 'VARCHAR(20)';
  if (fieldName === 'postal_code') return 'VARCHAR(10)';
  if (fieldName.endsWith('_id') || fieldName === 'school_id' || fieldName === 'user_id' || 
      fieldName === 'student_id' || fieldName === 'teacher_id' || fieldName === 'parent_id' || 
      fieldName === 'class_id' || fieldName === 'subject_id' || fieldName === 'office_id') {
    return 'INTEGER';
  }
  if (fieldName === 'version_vector' || fieldName === 'base_vector' || fieldName === 'server_vector' ||
      (colName === 'summer_classes' && fieldName === 'schedule') ||
      (colName === 'summer_enrollments' && fieldName === 'attendance') ||
      (colName === 'summer_classes' && fieldName === 'student_ids')) return 'JSONB';
  if (fieldName === 'version' || fieldName === 'base_version' || fieldName === 'server_version' || 
      fieldName === 'grade' || fieldName === 'capacity' || fieldName === 'units' || 
      fieldName === 'year' || fieldName === 'read' || fieldName === 'late' || fieldName === 'count') {
    return 'INTEGER';
  }
  if (fieldName === 'active' || fieldName === 'is_active' || fieldName === 'passed' || fieldName === 'verified' || fieldName === 'read') {
    return 'BOOLEAN';
  }
  if (fieldName === 'score' || fieldName === 'amount' || fieldName === 'price' || 
      fieldName === 'balance' || fieldName === 'total' || fieldName === 'fee' || 
      fieldName === 'gpa' || fieldName === 'rate') {
    return 'NUMERIC(12, 2)';
  }
  if (fieldName.endsWith('_at') || fieldName === 'created_at' || fieldName === 'updated_at' || fieldName === 'at') {
    return 'TIMESTAMPTZ';
  }
  if (fieldName.endsWith('_date') || fieldName === 'date' || fieldName === 'birth_date' || fieldName === 'from_date' || fieldName === 'to_date') {
    return 'VARCHAR(50)';
  }
  if (fieldName === 'capabilities' || fieldName === 'data' || fieldName === 'meta' || 
      fieldName === 'settings' || fieldName === 'incoming' || fieldName === 'server_state' || 
      fieldName === 'items' || fieldName === 'options' || fieldName === 'extra' ||
      fieldName === 'criteria') {
    return 'JSONB';
  }
  if (fieldName === 'body' || fieldName === 'text' || fieldName === 'note' || 
      fieldName === 'notes' || fieldName === 'description' || fieldName === 'summary' || 
      fieldName === 'details' || fieldName === 'iep_notes' || fieldName === 'feedback') {
    return 'TEXT';
  }

  // Type inference based on sample value
  if (sampleVal !== undefined && sampleVal !== null) {
    if (typeof sampleVal === 'boolean') return 'BOOLEAN';
    if (typeof sampleVal === 'number') {
      return Number.isInteger(sampleVal) ? 'INTEGER' : 'NUMERIC(12, 2)';
    }
    if (typeof sampleVal === 'object') return 'JSONB';
    if (typeof sampleVal === 'string' && sampleVal.length > 255) return 'TEXT';
  }

  return 'VARCHAR(255)';
}

/* Escape SQL literals */
function escapeSqlVal(val, type) {
  if (val === undefined || val === null) return 'NULL';
  if (type === 'BOOLEAN') return val ? 'TRUE' : 'FALSE';
  if (type === 'INTEGER') {
    const n = parseInt(val, 10);
    return isNaN(n) ? 'NULL' : String(n);
  }
  if (type.startsWith('NUMERIC')) {
    const n = parseFloat(val);
    return isNaN(n) ? 'NULL' : String(n);
  }
  if (type === 'JSONB') {
    const jsonStr = typeof val === 'string' ? val : JSON.stringify(val);
    return "'" + jsonStr.replace(/'/g, "''") + "'::jsonb";
  }
  if (type === 'TIMESTAMPTZ') {
    if (typeof val === 'number') {
      return "'" + new Date(val).toISOString() + "'::timestamptz";
    }
    const s = String(val).replace(/'/g, "''");
    return "'" + s + "'::timestamptz";
  }
  // Default string
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return "'" + str.replace(/'/g, "''") + "'";
}

/* Generate full DDL Schema for all 80 tables */
function generateDDL() {
  const ddl = [];
  ddl.push('-- ═══════════════════════════════════════════════════════════════════');
  ddl.push('-- Payesh PostgreSQL Relational Schema (80 Collections)');
  ddl.push('-- Auto-generated from authz/model.json');
  ddl.push('-- ═══════════════════════════════════════════════════════════════════\n');
  ddl.push('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  ddl.push('CREATE EXTENSION IF NOT EXISTS "btree_gist";\n');

  // Metadata / internal state tables
  ddl.push('-- Internal synchronization & session management tables');
  ddl.push(`CREATE TABLE IF NOT EXISTS server_processed_uids (
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
`);

  const colNames = Object.keys(collections);
  for (const col of colNames) {
    const def = collections[col];
    const fields = managedFields(col, def.fields || []);
    
    // Ensure 'id' exists
    const allFields = fields.includes('id') ? fields : ['id', ...fields];
    
    ddl.push(`-- Table: ${col}`);
    ddl.push(`CREATE TABLE IF NOT EXISTS ${col} (`);
    
    const colDefs = [];
    for (const f of allFields) {
      const type = getColumnType(col, f);
      colDefs.push(`  "${f}" ${type}`);
    }

    // Add foreign key constraint if school_id exists and col is not schools
    if (col !== 'schools' && allFields.includes('school_id')) {
      colDefs.push(`  CONSTRAINT fk_${col}_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED`);
    }

    /* P1-13 (تمامیت داده، مقیاس ملی): اینوارینت‌های کسب‌وکار در سطح دیتابیس.
       هر قید فقط وقتی صادر می‌شود که ستون‌هایش در مدل باشند (محافظت در برابر رانش مدل). */
    if (col === 'classes' && allFields.includes('capacity')) {
      colDefs.push('  CONSTRAINT chk_classes_capacity CHECK (capacity > 0)');
    }
    if (col === 'enrollments' && allFields.includes('student_id') && allFields.includes('year')) {
      /* یک دانش‌آموز، یک ثبت‌نام در هر سال. نکته: NULLها در UNIQUE پستگرس تداخل ندارند
         (فعلاً year خالی است پس قید روی دادهٔ امروز خنثی است)؛ انتقالِ هم‌سال با دو سطرِ
         باز باید در سطح اپ بسته شود (سطرِ پیشین بسته/حذف شود). */
      colDefs.push('  CONSTRAINT uq_enrollments_student_year UNIQUE (student_id, year)');
    }
    if (col === 'schedule' && allFields.includes('teacher_id') && allFields.includes('day') && allFields.includes('period')) {
      colDefs.push('  CONSTRAINT uq_schedule_teacher_slot UNIQUE (teacher_id, day, period)');
    }
    if (col === 'users' && allFields.includes('status')) {
      /* enum دقیقاً از server/validate.js (STATUS_ENUMS.users) — مقدار چهارم awaiting_transfer است نه transferred */
      colDefs.push("  CONSTRAINT chk_users_status CHECK (status IN ('active', 'dropped_out', 'graduated', 'awaiting_transfer'))");
    }
    if (col === 'grades') {
      if (allFields.includes('student_id')) colDefs.push('  CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
      if (allFields.includes('class_id')) colDefs.push('  CONSTRAINT fk_grades_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
      if (allFields.includes('subject_id')) colDefs.push('  CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
      if (allFields.includes('teacher_id')) colDefs.push('  CONSTRAINT fk_grades_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
    }

    ddl.push(colDefs.join(',\n'));
    ddl.push(');\n');

    // Add indexes
    if (allFields.includes('school_id')) {
      ddl.push(`CREATE INDEX IF NOT EXISTS idx_${col}_school_id ON ${col} (school_id);`);
    }
    if (allFields.includes('school_id') && allFields.includes('national_id')) {
      ddl.push(`CREATE INDEX IF NOT EXISTS idx_${col}_school_nid ON ${col} (school_id, national_id);`);
    }
    if (allFields.includes('school_id') && allFields.includes('student_id')) {
      ddl.push(`CREATE INDEX IF NOT EXISTS idx_${col}_school_student ON ${col} (school_id, student_id);`);
    }
    if (allFields.includes('school_id') && allFields.includes('class_id')) {
      ddl.push(`CREATE INDEX IF NOT EXISTS idx_${col}_school_class ON ${col} (school_id, class_id);`);
    }
    if (allFields.includes('created_at')) {
      ddl.push(`CREATE INDEX IF NOT EXISTS idx_${col}_created_at ON ${col} (created_at DESC);`);
    }
    ddl.push('');
  }

  // Composite indexes & GIN indexes
  ddl.push('-- Specialized Performance Composite Indexes');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_users_school_role ON users (school_id, role);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_attendance_school_class_date ON attendance (school_id, class_id, date);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_grades_school_student_subject ON grades (school_id, student_id, subject_id);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_schedule_school_teacher_day ON schedule (school_id, teacher_id, day);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_parent_links_parent_student ON parent_links (parent_id, student_id);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_messages_to_from ON messages (to_id, from_id);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_sync_conflicts_school_status ON sync_conflicts (school_id, status);');
  ddl.push('CREATE INDEX IF NOT EXISTS idx_schools_capabilities ON schools USING GIN (capabilities);\n');

  return ddl.join('\n');
}

/* Generate Bulk Insert SQL from JSON store */
function generateMigrationSQL(store) {
  const statements = [];
  statements.push(generateDDL());
  statements.push('BEGIN;\n');

  // Insert order prioritizing schools, then users, then others
  const allCols = Object.keys(collections);
  const orderedCols = ['schools', 'users', ...allCols.filter(c => c !== 'schools' && c !== 'users')];

  let totalRows = 0;

  for (const col of orderedCols) {
    const rows = Array.isArray(store[col]) ? store[col] : [];
    if (rows.length === 0) continue;

    const def = collections[col];
    const fields = managedFields(col, def.fields || Object.keys(rows[0] || {}));
    const colList = fields.map(f => `"${f}"`).join(', ');

    statements.push(`-- Inserting ${rows.length} rows into ${col}`);
    
    // Batch in chunks of 100 rows
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const valuesRows = [];

      for (const row of chunk) {
        const valArr = fields.map(f => {
          const type = getColumnType(col, f, row[f]);
          return escapeSqlVal(row[f], type);
        });
        valuesRows.push(`  (${valArr.join(', ')})`);
      }

      const sql = `INSERT INTO ${col} (${colList})\nVALUES\n${valuesRows.join(',\n')}\nON CONFLICT (id) DO UPDATE SET\n` +
        fields.filter(f => f !== 'id').map(f => `  "${f}" = EXCLUDED."${f}"`).join(',\n') + ';';
      statements.push(sql);
    }
    statements.push('');
    totalRows += rows.length;
  }

  // Insert internal tracking state
  if (store.__processed_uids && typeof store.__processed_uids === 'object') {
    const uids = Object.entries(store.__processed_uids);
    if (uids.length > 0) {
      statements.push(`-- Inserting ${uids.length} processed uids`);
      for (const [uid, ts] of uids) {
        statements.push(`INSERT INTO server_processed_uids (uid, processed_at) VALUES ('${uid.replace(/'/g, "''")}', '${new Date(ts).toISOString()}') ON CONFLICT (uid) DO NOTHING;`);
      }
      statements.push('');
    }
  }

  statements.push('COMMIT;\n');
  return { sql: statements.join('\n'), totalRows };
}

/* Direct Migration execution with PostgreSQL */
async function executeMigration(store) {
  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    console.error('Error: pg driver is not installed. Please install pg (npm i pg) to execute direct migration.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required for execution mode.');
    console.error('Example: DATABASE_URL=postgresql://user:pass@localhost:5432/payesh node tools/migrate-to-pg.js --execute');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000
  });

  const client = await pool.connect();
  try {
    console.log('Connected to PostgreSQL database:', databaseUrl.replace(/:[^:@]+@/, ':***@'));
    console.log('Generating DDL and migration script...');
    const { sql, totalRows } = generateMigrationSQL(store);

    console.log(`Executing SQL migration (${totalRows} records across 80 collections)...`);
    await client.query(sql);
    console.log('Migration completed successfully!');

    // Validation
    console.log('\n--- Data Verification ---');
    for (const col of Object.keys(collections).slice(0, 10)) {
      const res = await client.query(`SELECT COUNT(*) FROM ${col}`);
      const count = parseInt(res.rows[0].count, 10);
      const expected = (store[col] || []).length;
      console.log(`Table ${col}: ${count} rows (source: ${expected}) -> ${count >= expected ? 'OK' : 'MISMATCH'}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

/* CLI runner */
async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isSqlOnly = args.includes('--sql') || args.includes('--dump-sql');
  const isDryRun = args.includes('--dry-run');

  let store = {};
  if (fs.existsSync(STORE_FILE)) {
    store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } else {
    console.log('Note: No store file found at ' + STORE_FILE + '. Generating schema DDL only.');
  }

  const { sql, totalRows } = generateMigrationSQL(store);

  // Write DDL/Migration to server/schema.sql
  fs.writeFileSync(SCHEMA_FILE, sql, 'utf8');
  console.log(`[OK] PostgreSQL Schema and Migration DDL written to ${SCHEMA_FILE} (${sql.length} bytes)`);

  if (isExecute) {
    await executeMigration(store);
  } else {
    console.log(`[OK] Migration Plan & DDL ready for ${Object.keys(collections).length} tables and ${totalRows} data rows.`);
    console.log('To execute migration against PostgreSQL, run:');
    console.log('  DATABASE_URL=postgresql://user:pass@host:5432/dbname node tools/migrate-to-pg.js --execute');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = {
  generateDDL,
  generateMigrationSQL,
  getColumnType,
  escapeSqlVal
};
