#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Wave 18 — تست‌هایِ تستِ بارِ ملی (تولیدِ داده + زیرساختِ k6 + مستندات)
   پوشش:
     T1  generate-national-dataset.js وجود دارد و --help سالم است
     T2  --plan اعدادِ دقیقِ ملی را چاپ می‌کند (10M/100k/1M/50M/20M)
     T3  تولیدِ مقیاسِ کوچک: فایل‌ها + stats سازگار + شمارهٔ ملی معتبر
         + تلفنِ 12 رقمی + FKهایِ کلاس/حضور نمونه‌ای + فرمول‌هایِ تعداد
     T4  قطعی بودن (determinism): دو اجرا = sha256 یکسان
     T5  زیرساختِ k6: 6 سناریو + 4 سوئیت + helpers + config + runner
     T6  مستندات: LOAD_TESTING_PLAN + WAVE18_LOAD_TEST_PLAN (چهار سناریو
         الزامی: عادی/اوج/فشار/چند روزه)
     T7  READMEِ خروجی: PG COPY + راهنمایِ k6
   اجرا: node tests/wave18-load-test.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'tools', 'generate-national-dataset.js');
const PERF = path.join(ROOT, 'tests', 'performance');

let pass = 0, fail = 0;
function chk(name, cond, detail){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function sha(fp){ return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex'); }
function countRows(fp){
  const s = fs.readFileSync(fp, 'utf8');
  return s.split('\n').filter(l => l.length).length - 1; /* header جدا */
}
/* اعتبارِ رقمِ کنترلِ شناسهٔ ملی (الگوریتمِ رسمی) */
function nidValid(n){
  if(!/^\d{10}$/.test(n)) return false;
  let sum = 0;
  for(let i = 0; i < 9; i++) sum += Number(n[i]) * (10 - i);
  const rem = sum % 11;
  const check = rem < 2 ? rem : 11 - rem;
  return Number(n[9]) === check;
}
const run = (args) => spawnSync(process.execPath, [GEN, ...args], { cwd: ROOT, encoding: 'utf8' });

/* ── T1: --help ──────────────────────────────────────────────────── */
{
  chk('T1a ابزار وجود دارد', fs.existsSync(GEN));
  const h = run(['--help']);
  chk('T1b --help exit 0', h.status === 0, 'status=' + h.status);
  chk('T1c --help متنِ usage', /--scale/.test(h.stdout) && /--plan/.test(h.stdout) && /--seed/.test(h.stdout));
}

/* ── T2: --plan اعدادِ دقیقِ ملی ─────────────────────────────────── */
{
  const p = run(['--plan']);
  chk('T2a --plan exit 0', p.status === 0);
  const out = p.stdout;
  chk('T2b users 10,000,000', /users\s+10000000/.test(out), out.slice(0, 400));
  chk('T2c schools 100,000', /schools\s+100000\n/.test(out));
  chk('T2d classes 1,000,000', /classes\s+1000000/.test(out));
  chk('T2e attendance 50,000,000', /attendance\s+50000000/.test(out));
  chk('T2f grades 20,000,000', /grades\s+20000000/.test(out));
  chk('T2g تفکیکِ نقش‌ها', /students\s+8000000/.test(out) && /teachers\s+1000000/.test(out) && /parents\s+900000/.test(out));
}

/* ── T3: تولیدِ مقیاسِ کوچک + اعتبارسنجی ────────────────────────── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w18-'));
const D1 = path.join(TMP, 'run1');
const D2 = path.join(TMP, 'run2');
const SCALE = '0.0001';
let stats = null;
{
  const g = run(['--scale', SCALE, '--out', D1, '--quiet']);
  chk('T3a تولید exit 0', g.status === 0, (g.stderr || '').slice(0, 300));
  const files = ['schools.csv','classes.csv','users.csv','parent_links.csv','attendance.csv','grades.csv','stats.json','README.md'];
  chk('T3b همهٔ فایل‌ها ساخته شدند', files.every(f => fs.existsSync(path.join(D1, f))), files.filter(f => !fs.existsSync(path.join(D1, f))).join(','));
  stats = JSON.parse(fs.readFileSync(path.join(D1, 'stats.json'), 'utf8'));
  const c = stats.counts;
  chk('T3c stats با فرمول‌هایِ plan سازگار',
    c.schools === stats.plan.schools && c.classes === stats.plan.classes && c.users === stats.plan.users &&
    c.attendance === stats.plan.attendance && c.grades === stats.plan.grades && c.parent_links === stats.plan.parentLinks,
    JSON.stringify(c));
  chk('T3d counts با تعدادِ سطرهایِ CSV برابر است',
    c.schools === countRows(path.join(D1, 'schools.csv')) &&
    c.classes === countRows(path.join(D1, 'classes.csv')) &&
    c.users === countRows(path.join(D1, 'users.csv')) &&
    c.attendance === countRows(path.join(D1, 'attendance.csv')) &&
    c.grades === countRows(path.join(D1, 'grades.csv')) &&
    c.parent_links === countRows(path.join(D1, 'parent_links.csv')));
  /* تفکیکِ نقش از خودِ CSV */
  const users = fs.readFileSync(path.join(D1, 'users.csv'), 'utf8').split('\n').slice(1).filter(l => l);
  const byRole = {};
  let nidBad = 0, phoneBad = 0;
  for(const line of users){
    const f = line.split(',');
    byRole[f[1]] = (byRole[f[1]] || 0) + 1;
    if(!nidValid(f[4])) nidBad++;
    if(!/^09\d{10}$/.test(f[5])) phoneBad++;
  }
  const tr = stats.total_users_by_role;
  chk('T3e تفکیکِ نقش با plan برابر است',
    (byRole.superadmin||0) === tr.superadmin && (byRole.teacher||0) === tr.teacher &&
    (byRole.student||0) === tr.student && (byRole.parent||0) === tr.parent &&
    (byRole.manager||0) === tr.manager && (byRole.edu_office||0) === tr.edu_office,
    JSON.stringify(byRole));
  chk('T3f همهٔ شماره‌هایِ ملی رقمِ کنترلِ معتبر دارند', nidBad === 0, nidBad + ' invalid');
  chk('T3g همهٔ تلفن‌ها فرمتِ 09… (12 رقم) دارند', phoneBad === 0, phoneBad + ' bad');
  /* تکرارناپذیریِ نیدها (نمونه: کلِ 1002 سطر کوچک است) */
  const nids = new Set(users.map(l => l.split(',')[4]));
  chk('T3h شناسه‌هایِ ملی تکرارناپذیرند', nids.size === users.length, nids.size + ' vs ' + users.length);
  const phones = new Set(users.map(l => l.split(',')[5]));
  chk('T3h2 تلفن‌ها تکرارناپذیرند', phones.size === users.length, phones.size + ' vs ' + users.length);
  /* FKها: homeroom و studentِ حضور در محدودهٔ idها */
  const tMin = +stats.plan.users; /* سقفِ idها = total users */
  const userSet = new Set(users.map(l => +l.split(',')[0]));
  const classes = fs.readFileSync(path.join(D1, 'classes.csv'), 'utf8').split('\n').slice(1).filter(l => l);
  let fkBad = 0;
  for(const line of classes){
    const f = line.split(',');
    if(!userSet.has(+f[7])) fkBad++; /* homeroom_teacher_id */
  }
  const att = fs.readFileSync(path.join(D1, 'attendance.csv'), 'utf8').split('\n').slice(1).filter(l => l);
  for(const line of att){
    const f = line.split(',');
    if(!userSet.has(+f[2])) fkBad++; /* student_id */
    if(!userSet.has(+f[6])) fkBad++; /* teacher_id */
  }
  const gr = fs.readFileSync(path.join(D1, 'grades.csv'), 'utf8').split('\n').slice(1).filter(l => l);
  for(const line of gr){
    const f = line.split(',');
    if(!userSet.has(+f[2]) || !userSet.has(+f[5])) fkBad++;
  }
  chk('T3i FKها (homeroom/student/teacher) همه معتبرند', fkBad === 0, fkBad + ' bad refs');
  /* وضعیت‌هایِ حضور از دامنهٔ مجاز */
  const statuses = new Set(att.map(l => l.split(',')[5]));
  chk('T3j وضعیت‌هایِ حضور ⊆ {present,absent,late,excused}',
    [...statuses].every(s => ['present','absent','late','excused'].includes(s)), JSON.stringify([...statuses]));
}

/* ── T4: قطعی بودن (دو اجرا = بایتِ یکسان) ──────────────────────── */
{
  run(['--scale', SCALE, '--out', D2, '--quiet']);
  const same = ['schools.csv','classes.csv','users.csv','parent_links.csv','attendance.csv','grades.csv']
    .every(f => sha(path.join(D1, f)) === sha(path.join(D2, f)));
  chk('T4 determinism: دو اجرا با seed یکسان = sha256 یکسان', same);
}

/* ── T5: زیرساختِ k6 ────────────────────────────────────────────── */
{
  const scenarios = ['01-login.js','02-bootstrap.js','03-attendance.js','04-grades.js','05-notifications.js','06-sync-batch.js'];
  const suites = ['spike-mehr-test.js','saturation-test.js','soak-24h-test.js','chaos-redis-test.js'];
  const helpers = ['auth-helper.js','metrics.js','payload-generator.js'];
  const config = ['environments.json','thresholds.json'];
  chk('T5a 6 سناریویِ k6', scenarios.every(f => fs.existsSync(path.join(PERF, 'scenarios', f))));
  chk('T5b 4 سوئیتِ k6 (اوج/فشار/چند-روزه/آشوب)', suites.every(f => fs.existsSync(path.join(PERF, 'suites', f))));
  chk('T5c helpers + config + runner', helpers.every(f => fs.existsSync(path.join(PERF, 'helpers', f)))
    && config.every(f => fs.existsSync(path.join(PERF, 'config', f)))
    && fs.existsSync(path.join(PERF, 'run-benchmarks.sh')) && fs.existsSync(path.join(PERF, 'README.md')));
  const allK6 = [...scenarios.map(f => path.join(PERF, 'scenarios', f)), ...suites.map(f => path.join(PERF, 'suites', f))];
  chk('T5d همهٔ اسکریپت‌ها اسکریپتِ k6 معتبرند (import k6 + options)',
    allK6.every(f => {
      const s = fs.readFileSync(f, 'utf8');
      return /from 'k6/.test(s) && /export const options/.test(s);
    }));
  let thOk = false, envOk = false;
  try{
    const th = JSON.parse(fs.readFileSync(path.join(PERF, 'config', 'thresholds.json'), 'utf8'));
    thOk = !!(th.global && th.scenarios && th.suites && th.global['http_req_failed'] && th.suites.soak_24h);
  }catch(e){}
  try{
    const ev = JSON.parse(fs.readFileSync(path.join(PERF, 'config', 'environments.json'), 'utf8'));
    envOk = !!(ev.environments && ev.environments.local && ev.environments.staging && ev.environments.cluster);
  }catch(e){}
  chk('T5e thresholds.json معتبر (global+scenarios+suites)', thOk);
  chk('T5f environments.json معتبر (local/staging/cluster)', envOk);
}

/* ── T6: مستندات ─────────────────────────────────────────────────── */
{
  chk('T6a docs/LOAD_TESTING_PLAN.md وجود دارد', fs.existsSync(path.join(ROOT, 'docs', 'LOAD_TESTING_PLAN.md')));
  const w18p = path.join(ROOT, 'docs', 'WAVE18_LOAD_TEST_PLAN.md');
  chk('T6b docs/WAVE18_LOAD_TEST_PLAN.md وجود دارد', fs.existsSync(w18p));
  if(fs.existsSync(w18p)){
    const s = fs.readFileSync(w18p, 'utf8');
    chk('T6c چهار سناریویِ الزامی مستند است',
      /بار عادی/.test(s) && /بار اوج/.test(s) && /فشار/.test(s) && /چند روزه/.test(s));
    chk('T6d ارجاع به generate-national-dataset.js', /generate-national-dataset\.js/.test(s));
    chk('T6e ارجاع به سناریوهایِ k6 موجود', /spike-mehr-test\.js/.test(s) && /saturation-test\.js/.test(s) && /soak-24h-test\.js/.test(s));
    chk('T6f وضعیتِ pending (زیرساختِ زنده) ثبت شده', /pending|در انتظار/i.test(s));
  }
}

/* ── T7: READMEِ خروجی ───────────────────────────────────────────── */
{
  const r = fs.readFileSync(path.join(D1, 'README.md'), 'utf8');
  chk('T7a راهنمایِ PG COPY', /\\\\copy schools/.test(r) || /copy schools/.test(r));
  chk('T7b راهنمایِ k6 + ارجاع به طرح', /k6/.test(r) && /WAVE18_LOAD_TEST_PLAN/.test(r));
  chk('T7c هشدارِ امنیتی (داده‌هایِ مصنوعی)', /مصنوعی/.test(r));
  chk('T7d stats.json شاملِ sha256 فایل‌ها', Object.keys(stats.checksums).length === 6);
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log('────────────────────────────────────────────');
console.log('Wave 18 — Load Test: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' خطا ❌' : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
