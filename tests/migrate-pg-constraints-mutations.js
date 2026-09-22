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
/* BH-mut فاز ۲ (الگوی امن p06/p11): ابزار در کپیِ جدا جهش می‌خورد؛ بازتولیدِ
   schema.sql از طریق passthrough به کپیِ سایه می‌رود — schema.sql اصلی و ابزار
   هرگز بازنویسی نمی‌شوند؛ بازگردانی حذف شد. */
const path = require('path');
const { session } = require('./helpers/mutant-kit');
const kit = session('mpc-mut-');
const ROOT = path.join(__dirname, '..');

const TOOL = 'tools/migrate-to-pg.js';
const SCHEMA = 'server/schema.sql';
kit.passthrough(path.join(ROOT, SCHEMA)); /* نوشتن/خواندنِ schema.sql فرزند → سایه */
const SUITE = 'tests/migrate-pg-constraints.js';
/* F-A4 (Arena 1): migrate-to-pg.js moved the grade FKs from inline colDefs to
   ALTER TABLE fkStatements (and the suite never regenerated schema.sql without
   --write-schema), so all five mutants "SURVIVED" a detector that could not see
   them. Pattern below mirrors tools/migrate-to-pg.js current lines verbatim. */
const GRADES_BLOCK = `      if (allFields.includes('student_id')) fkStatements.push(\`ALTER TABLE grades ADD CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED\`);
      if (allFields.includes('class_id')) fkStatements.push(\`ALTER TABLE grades ADD CONSTRAINT fk_grades_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED\`);
      if (allFields.includes('subject_id')) fkStatements.push(\`ALTER TABLE grades ADD CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED\`);
      if (allFields.includes('teacher_id')) fkStatements.push(\`ALTER TABLE grades ADD CONSTRAINT fk_grades_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED\`);`;
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
const TOOL_ABS = path.join(ROOT, TOOL);
let killed = 0, envFails = 0;
for (const m of MUTS) {
  if (tool0.indexOf(m.bad) < 0) { console.log('  NO-PATTERN ' + m.name); continue; }
  const mcopy = kit.mutant(TOOL_ABS, tool0.replace(m.bad, 'void 0; /* MUTANT */')); /* کپیِ جدا */
  try { fs.chmodSync(mcopy, fs.statSync(TOOL_ABS).mode); } catch (_) {}
  let out = '', crashed = false;
  try {
    /* F-A4: without --write-schema the tool never rewrites server/schema.sql
       (explicit since the crashed-run hardening), so every mutant silently
       "survived" against the untouched baseline file. */
    execSync('node ' + TOOL + ' --write-schema', { stdio: 'pipe', timeout: 120000, cwd: ROOT, env: kit.env() }); /* بازتولید در سایه */
    execSync('node ' + SUITE, { stdio: 'pipe', timeout: 120000, cwd: ROOT, env: kit.env() }); /* خواندن از سایه */
    out = 'PASSED (no failure)';
  } catch (e) {
    out = String((e.stdout || '') + String(e.stderr || ''));
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  if (crashed) { envFails++; console.log('  ENV-FAIL ' + m.name + ' — کرش/بی‌خروجی، نه زنده‌ماندن'); continue; }
  const killedThis = /❌/.test(out) && out.indexOf(m.expectFail) > -1;
  console.log('  ' + (killedThis ? 'KILLED' : 'SURVIVED!') + ' ' + m.name);
  if (killedThis) killed++;
}
kit.clear(TOOL_ABS); /* نقشهٔ خالی برای شفافیت؛ پاک‌سازیِ واقعی در exit */
/* خطِ پایه: schema.sql اصلیِ repo (بدون env) باید همهٔ قیدها را داشته باشد */
let backGreen = false;
try { execSync('node ' + SUITE, { stdio: 'pipe', timeout: 120000, cwd: ROOT }); backGreen = true; } catch (e) { backGreen = false; }
console.log('migrate-pg-constraints-mutations: ' + killed + '/' + MUTS.length + ' killed, baseline-green=' + backGreen + ', env-fail=' + envFails);
process.exit(killed === MUTS.length && envFails === 0 && backGreen ? 0 : 1);
