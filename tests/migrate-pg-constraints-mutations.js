#!/usr/bin/env node
/* migrate-pg-constraints-mutations.js — جهش‌های قیدهای DDL (P1-13)
   M1 حذف چکِ ظرفیت ← C-capacity
   M2 حذف یکتایی ثبت‌نام ← C-enrollment
   M3 حذف یکتایی سانِ دبیر ← C-schedule
   M4 حذف چکِ وضعیت ← C-status
   M5 حذف هر ۴ FK نمره ← C-grades
   هر جهش: ابزار جهش می‌خورد ← schema.sql بازتولید می‌شود ← سوئیت باید قرمز شود ← هر دو فایل برمی‌گردند.
   اجرا: node tests/migrate-pg-constraints-mutations.js */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const TOOL = 'tools/migrate-to-pg.js';
const SCHEMA = 'server/schema.sql';
const SUITE = 'tests/migrate-pg-constraints.js';
const GRADES_BLOCK = `    if (col === 'grades') {
      if (allFields.includes('student_id')) colDefs.push('  CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
      if (allFields.includes('class_id')) colDefs.push('  CONSTRAINT fk_grades_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
      if (allFields.includes('subject_id')) colDefs.push('  CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
      if (allFields.includes('teacher_id')) colDefs.push('  CONSTRAINT fk_grades_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED');
    }`;
const MUTS = [
  { bad: `colDefs.push('  CONSTRAINT chk_classes_capacity CHECK (capacity > 0)');`,
    name: 'M1 چکِ ظرفیت حذف شد', expectFail: 'C-capacity' },
  { bad: `colDefs.push('  CONSTRAINT uq_enrollments_student_year UNIQUE (student_id, year)');`,
    name: 'M2 یکتایی ثبت‌نام حذف شد', expectFail: 'C-enrollment' },
  { bad: `colDefs.push('  CONSTRAINT uq_schedule_teacher_slot UNIQUE (teacher_id, day, period)');`,
    name: 'M3 یکتایی سانِ دبیر حذف شد', expectFail: 'C-schedule' },
  { bad: `colDefs.push("  CONSTRAINT chk_users_status CHECK (status IN ('active', 'dropped_out', 'graduated', 'awaiting_transfer'))");`,
    name: 'M4 چکِ وضعیت حذف شد', expectFail: 'C-status' },
  { bad: GRADES_BLOCK,
    name: 'M5 هر ۴ FK نمره حذف شد', expectFail: 'C-grades' },
];

const tool0 = fs.readFileSync(TOOL, 'utf8');
const schema0 = fs.readFileSync(SCHEMA, 'utf8');
let killed = 0, envFails = 0;
for (const m of MUTS) {
  if (tool0.indexOf(m.bad) < 0) { console.log('  NO-PATTERN ' + m.name); continue; }
  fs.writeFileSync(TOOL, tool0.replace(m.bad, 'void 0; /* MUTANT */'));
  let out = '', crashed = false;
  try {
    execSync('node ' + TOOL, { stdio: 'pipe', timeout: 120000 });
    execSync('node ' + SUITE, { stdio: 'pipe', timeout: 120000 });
    out = 'PASSED (no failure)';
  } catch (e) {
    out = String((e.stdout || '') + String(e.stderr || ''));
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  fs.writeFileSync(TOOL, tool0);
  fs.writeFileSync(SCHEMA, schema0);
  if (crashed) { envFails++; console.log('  ENV-FAIL ' + m.name + ' — کرش/بی‌خروجی، نه زنده‌ماندن'); continue; }
  const killedThis = /❌/.test(out) && out.indexOf(m.expectFail) > -1;
  console.log('  ' + (killedThis ? 'KILLED' : 'SURVIVED!') + ' ' + m.name);
  if (killedThis) killed++;
}
console.log('migrate-pg-constraints-mutations: ' + killed + '/' + MUTS.length + ' killed, env-fail=' + envFails);
process.exit(killed === MUTS.length && envFails === 0 ? 0 : 1);
