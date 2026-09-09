#!/usr/bin/env node
/**
 * تست‌های جهشیِ گردشِ کارِ تجدیدی (بند ۶.۵ — فاز ۵)
 * ─────────────────────────────────────────────────────────────────
 * هر جهش یک «تصمیمِ درست» را خراب می‌کند و باید کشته شود؛ اگر زنده
 * ماند، یعنی اندازه‌گیری (چکِ تست) کافی نیست — نه اینکه کد درست است.
 *
 *   M1  آستانهٔ قبولی (۰.۵ → ۰.۴)                       → W2/W3
 *   M2  حذفِ استثنایِ نمرهٔ تجدیدی در retakeIsFail        → W3
 *   M3  بی‌اثر کردنِ برتریِ نوبتِ دوم                     → W4
 *   M4  حذفِ فیلترِ مدرسه در subjectFinalGrades           → W19
 *   M5  حذفِ جلوگیری از ثبتِ تکراری                      → W8
 *   M6  ردیفِ نمره بدونِ برچسبِ is_retake                 → W9c/W9d
 *   M7  بازنویسیِ نمرهٔ اصلی به‌جایِ درجِ ردیفِ تازه       → W9c/W9e
 *   M8  حذفِ بازهٔ ۰-۲۰                                  → W12
 *   M9  نمرهٔ مؤثر = نمرهٔ خام                            → W10
 *   M10 ردیفِ پیوندخورده به جریانِ قدیمی برود             → W9b
 *   M11 کارتِ دبیر: محدودیتِ کلاس برداشته شود             → W14c
 *   M12 گاردِ سرور: انجام‌شده‌یِ بی‌نمره مجاز شود          → S10
 *   M13 سرور: reexams از STATUS_UPD_ROLEِ دبیر برداشته → S3
 *
 * اجرا:  node tests/retake-exams-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
    /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه) → retry یک‌بار، بعد env-failِ صریح. */
    const completed = (o) => /بررسی — /.test(o || '');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    let r = runOnce();
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگام) — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && killRe.test(r.stdout), tag);
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

const SUITE = 'tests/retake-exams.js';

/* M1 — آستانهٔ قبولی از نیمی از بیشینه به ۰.۴ (قبولی ۸ از ۲۰) */
mutate('src/js/72-retake-exams.js',
  'const RETAKE_PASS_RATIO = 0.5;',
  'const RETAKE_PASS_RATIO = 0.4;',
  SUITE, /❌ W2/, 'M1 آستانهٔ قبولی (۰.۵ → ۰.۴)');

/* M2 — نمرهٔ تجدیدی هم مردود حساب شود (چرخهٔ بی‌پایانِ تجدیدی) */
mutate('src/js/72-retake-exams.js',
  "  if(Number(g.is_retake) === 1) return false;\n  if(g.score == null || g.score === '') return false;",
  "  if(g.score == null || g.score === '') return false;",
  SUITE, /❌ W3/, 'M2 حذفِ استثنایِ نمرهٔ تجدیدی در retakeIsFail');

/* M3 — برتریِ نوبتِ دوم بی‌اثر شود */
mutate('src/js/72-retake-exams.js',
  'if(d > 0){ map[k] = g; return; }',
  'if(false){ map[k] = g; return; }',
  SUITE, /❌ W4/, 'M3 بی‌اثر کردنِ برتریِ نوبتِ دوم');

/* M4 — فیلترِ مدرسه برداشته شود (نشتِ بین‌مدرسه‌ای) */
mutate('src/js/72-retake-exams.js',
  'if(schoolId != null && Number(g.school_id) !== Number(schoolId)) return;',
  'if(false) return;',
  SUITE, /❌ W19/, 'M4 حذفِ فیلترِ مدرسه در subjectFinalGrades');

/* M5 — جلوگیری از ثبتِ تکراری برداشته شود */
mutate('src/js/72-retake-exams.js',
  "  if(reexamOfGrade(g.id)) return { ok: false, err: 'تجدیدیِ این درس قبلاً ثبت شده' };",
  '  if(false) return { ok: false, err: null };',
  SUITE, /❌ W8/, 'M5 حذفِ جلوگیری از ثبتِ تکراری');

/* M6 — ردیفِ نمرهٔ تجدیدی بدونِ برچسب ساخته شود */
mutate('src/js/72-retake-exams.js',
  'is_retake: 1, retake_of_grade_id: orig.id,',
  'is_retake: 0, retake_of_grade_id: orig.id,',
  SUITE, /❌ W9[cd]/, 'M6 ردیفِ نمره بدونِ برچسبِ is_retake');

/* M7 — نمرهٔ اصلی بازنویسی شود (تاریخچه از بین برود) */
mutate('src/js/72-retake-exams.js',
  "  insert('grades', {\n    school_id: r.school_id, class_id: orig.class_id || cls.id || null,",
  "  update('grades', orig.id, { score: n, updated_at: todayISO() });\n  insert('grades', {\n    school_id: r.school_id, class_id: orig.class_id || cls.id || null,",
  SUITE, /❌ W9e/, 'M7 بازنویسیِ نمرهٔ اصلی به‌جایِ درجِ ردیفِ تازه');

/* M8 — بازهٔ ۰-۲۰ برداشته شود */
mutate('src/js/72-retake-exams.js',
  'if(n < 0 || n > 20) return { ok: false, err: \'نمره باید ۰ تا ۲۰ باشد\' };',
  'if(false) return { ok: false, err: null };',
  SUITE, /❌ W12/, 'M8 حذفِ بازهٔ ۰-۲۰');

/* M9 — نمرهٔ مؤثر همان نمرهٔ خام باشد */
mutate('src/js/72-retake-exams.js',
  'return r != null ? Number(r.score) : Number(g.score);',
  'return Number(g.score);',
  SUITE, /❌ W10/, 'M9 نمرهٔ مؤثر = نمرهٔ خام');

/* M10 — ردیفِ پیوندخورده به جریانِ قدیمی برود (نمره واردِ دفترِ نمرات نشود) */
mutate('src/js/63-reexam.js',
  "'+(r.grade_id?'rt-score':'reexam-score')+'",
  "'+'reexam-score'+'",
  SUITE, /❌ W9b|❌ W9c/, 'M10 ردیفِ پیوندخورده به جریانِ قدیمی');

/* M11 — کارتِ دبیر: محدودیتِ کلاس برداشته شود */
mutate('src/js/72-retake-exams.js',
  '      }\n    : function(){ return true; };\n  const rows = (db.reexams || []).filter(function(r){\n    return Number(r.school_id) === Number(schoolId) && myStudents(r.student_id);\n  });',
  '      }\n    : function(){ return true; };\n  const rows = (db.reexams || []).filter(function(r){\n    return Number(r.school_id) === Number(schoolId);\n  });',
  SUITE, /❌ W14c/, 'M11 کارتِ دبیر بدونِ محدودیتِ کلاس');

/* M12 — گاردِ سرور: انجام‌شده‌یِ بی‌نمره مجاز شود */
mutate('server/sync.js',
  "      if(op.c === 'reexams' && s.role === 'teacher' && String(d.status) === 'done'\n         && (d.new_score == null || d.new_score === ''))",
  "      if(false)",
  SUITE, /❌ S10/, 'M12 گاردِ انجام‌شده‌یِ بی‌نمره برداشته شود');

/* M13 — reexams از STATUS_UPD_ROLEِ دبیر برداشته شود */
mutate('server/sync.js',
  "  reexams: ['teacher'],",
  "  reexams: ['nobody'],",
  SUITE, /❌ S3/, 'M13 برداشتنِ reexams از انتقالِ وضعیتِ دبیر');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base = spawnSync('node', [path.join(ROOT, SUITE)], { cwd: ROOT, encoding: 'utf8' });
chk(base.status === 0, 'خطِّ پایهٔ retake-exams سبز است (' + (base.stdout.match(/(\d+) بررسی/) || [])[1] + ' بررسی)');
const b2 = spawnSync('node', [path.join(ROOT, 'tests/reexam2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ reexam2 (بند ۶.۱) سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/reexam3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ reexam3 (سرورِ ۶.۱) سبز است');

console.log(`\nretake-exams-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`
  + (envFails ? ` · ⚠️ خطای محیطی: ${envFails}` : ''));
process.exit(fail ? 1 : 0);
