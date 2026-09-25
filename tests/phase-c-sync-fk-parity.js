#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════════
   Phase C verify (Arena) — هم‌سازیِ مسیرِ سینک با گاردهای A-21/A-18
   ─────────────────────────────────────────────────────────────────────
   ممیزیِ مستقلِ adversarial (پروب‌های B2b/B3 رویِ 49386316) نشان داد
   گاردهای A-21 فقط رویِ مسیرهای REST نشسته‌اند و مسیرِ /api/sync همان
   کلاس‌نقص را دارد؛ همچنین حلِ تعارضِ رکوردِ سراسری برای مدیر باز بود.

   نقص‌های اثبات‌شدهٔ پیش‌از اصلاح (رویِ همین سرور، با دادهٔ واقعی):
     ۱) مدیرِ مدرسهٔ آ: برنامهٔ درسی با teacher_idِ دبیرِ مدرسهٔ ب ⇒ اعمال
        ⇒ آلودگیِ teacherClassIds ⇒ دبیرِ ب نمره/حضورِ مدرسهٔ آ را
        تغییر/حذف می‌کرد (K3/K4) و فهرستِ حضورِ کلاسِ آ را می‌خواند (K9).
     ۲) مدیر: به‌روزرسانیِ classes.homeroom_teacher_id با دبیرِ مدرسهٔ
        دیگر از راهِ سینک ⇒ اعمال (K5).
     ۳) مدیر: حلِ تعارضِ سراسری (school_id null) ⇒ بازنویسیِ اطلاعیهٔ
        سراسری (B3-C3).

   این پرونده همان حمله‌ها را رویِ سرورِ واقعیِ حافظه‌ای بازتولید می‌کند:
   قبل از اصلاح باید قرمز باشند؛ بعد از اصلاح همه سبز.

   اجرا:  node tests/phase-c-sync-fk-parity.js
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function bootServer(port, mutateStore, extraEnv) {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-fkp-'));
    const tmpStore = path.join(tmpDir, 's.json');
    const srcStore = path.join(ROOT, 'server', 'data', 'payesh.json');
    if (!fs.existsSync(srcStore)) {
      const { execSync } = require('child_process');
      execSync('node server/seed.js', { cwd: ROOT, stdio: 'ignore' });
    }
    const store = JSON.parse(fs.readFileSync(srcStore, 'utf8'));
    if (typeof mutateStore === 'function') mutateStore(store);
    fs.writeFileSync(tmpStore, JSON.stringify(store));
    const env = Object.assign({}, process.env, {
      PORT: String(port), HOST: '127.0.0.1',
      PAYESH_STORE: tmpStore,
      PAYESH_AUDIT: path.join(tmpDir, 'a.log'),
      PAYESH_KEY: path.join(tmpDir, 'k.key'),
      PAYESH_DEMO_CODE: '1'
    }, extraEnv || {});
    delete env.NODE_ENV; delete env.REDIS_URL; delete env.DATABASE_URL;
    const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));
    resolve({ child, log: () => log, tmpDir, store });
  });
}

function makeReq(port) {
  return (method, p, body, cookie) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: Object.assign({ 'content-type': 'application/json' },
        data ? { 'content-length': Buffer.byteLength(data) } : {},
        cookie ? { cookie } : {}) },
      (res) => { let b = ''; res.on('data', d => (b += d)); res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers });
      }); });
    r.on('error', (e) => resolve({ status: 0, json: null, error: e.message, headers: {} }));
    if (data) r.write(data);
    r.end();
  });
}

async function waitReady(req, tries) {
  for (let i = 0; i < (tries || 60); i++) {
    const h = await req('GET', '/api/health', null, null);
    if (h.status > 0) return true;
    await sleep(250);
  }
  return false;
}

async function loginAs(req, user) {
  const sc = await req('POST', '/api/auth/send-code', { phone: user.phone });
  const code = sc.json && sc.json.demo_code;
  if (!code) return null;
  const lg = await req('POST', '/api/auth/login', { phone: user.phone, code, national_id: user.national_id });
  if (lg.status !== 200) return null;
  return (lg.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

let uidSeq = 0;
const op = (by, c, t, data, extra) => Object.assign(
  { uid: 'fkp_' + (++uidSeq), c, t, data, by, at: new Date().toISOString() }, extra || {});
const first = (j) => (j && j.results && j.results[0]) || {};
const applied = (j) => !!(j && j.ok === true && first(j).ok !== false);

(async () => {
  const PORT = 4911;
  /* ── انتخابِ بازیگران از دادهٔ واقعی ─────────────────────────────── */
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), 'utf8'));
  const users = seed.users || [];
  const managers = users.filter(u => u.role === 'manager' && u.school_id != null && u.phone && u.national_id);
  const teachers = users.filter(u => u.role === 'teacher' && u.school_id != null && u.phone && u.national_id);
  let mgr = null, cls = null, student = null, grade = null, foreignTeacher = null;
  for (const m of managers) {
    const c = (seed.classes || []).find(c => Number(c.school_id) === Number(m.school_id));
    if (!c) continue;
    const enr = (seed.enrollments || []).find(e => Number(e.class_id) === Number(c.id));
    if (!enr) continue;
    const g = (seed.grades || []).find(x => Number(x.student_id) === Number(enr.student_id));
    const att = (seed.attendance || []).find(x => Number(x.student_id) === Number(enr.student_id));
    if (!g || !att) continue;
    const ft = teachers.find(t => Number(t.school_id) !== Number(m.school_id));
    if (!ft) continue;
    mgr = m; cls = c; student = enr.student_id; grade = g; foreignTeacher = ft;
    break;
  }
  if (!mgr) { console.log('  ❌ seed: manager/class/student/foreign-teacher پیدا نشد'); process.exit(1); }

  /* ── آلودگیِ پیش‌ساز: ردیفِ برنامهٔ درسیِ جعلی + تعارضِ سراسری ─────
     این دو «مستقیم در ذخیره‌ساز» کاشته می‌شوند تا لایهٔ دومِ اصلاح
     (بررسیِ مدرسه در بازویِ دبیرِ inScope) جداگانه سنجیده شود — حتی اگر
     آلودگی از راهی غیر از سینک وارد شده باشد. */
  const POISON_SCHED = { id: 990011, school_id: Number(cls.school_id), class_id: Number(cls.id),
    subject_id: (seed.subjects && seed.subjects[0] && seed.subjects[0].id) || 1,
    teacher_id: Number(foreignTeacher.id), day: 'sat', period: 9 };
  const GLOBAL_ANN = { id: 990012, school_id: null, title: 'سراسریِ اصلی', body: 'x', date: '2026-09-01' };
  const GLOBAL_CONFLICT = { id: 990013, collection: 'announcements', record_id: GLOBAL_ANN.id,
    school_id: null, base_version: 1, server_version: 2,
    incoming: { title: 'pwn-global' }, status: 'open',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const OWN_GRADE_CONFLICT = { id: 990014, collection: 'grades', record_id: Number(grade.id),
    school_id: Number(cls.school_id), base_version: 1, server_version: 2,
    incoming: { score: '19.5', school_id: Number(cls.school_id) }, status: 'open',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  const srv = await bootServer(PORT, (store) => {
    if (!Array.isArray(store.schedule)) store.schedule = [];
    store.schedule.push(POISON_SCHED);
    if (!Array.isArray(store.announcements)) store.announcements = [];
    store.announcements.push(GLOBAL_ANN);
    if (!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
    store.sync_conflicts.push(GLOBAL_CONFLICT, OWN_GRADE_CONFLICT);
  });
  const req = makeReq(PORT);
  if (!(await waitReady(req))) { console.log(srv.log().slice(-800)); process.exit(1); }

  const ckMgr = await loginAs(req, mgr);
  const ckForeign = await loginAs(req, foreignTeacher);
  chk('ورود مدیر و دبیر بیگانه', !!(ckMgr && ckForeign));

  const sync = async (ck, opsArr) => (await req('POST', '/api/sync', { ops: opsArr }, ck)).json;

  /* ۱ — آلودگی از راهِ سینک: برنامهٔ درسی با دبیرِ مدرسهٔ دیگر */
  {
    const j = await sync(ckMgr, [op(mgr.id, 'schedule', 'ins',
      { school_id: Number(cls.school_id), class_id: Number(cls.id), subject_id: POISON_SCHED.subject_id, teacher_id: Number(foreignTeacher.id), day: 'sun', period: 8 })]);
    chk('سینک: برنامهٔ درسی با دبیرِ مدرسهٔ دیگر رد می‌شود (invalid_fk)', first(j).code === 'invalid_fk', JSON.stringify(first(j)));
  }
  /* ۲ — آلودگی از راهِ سینک: سرپرستیِ کلاس با دبیرِ مدرسهٔ دیگر */
  {
    const j = await sync(ckMgr, [op(mgr.id, 'classes', 'upd',
      { homeroom_teacher_id: Number(foreignTeacher.id) }, { id: Number(cls.id), base_version: Number(cls.version) || 1 })]);
    chk('سینک: سرپرستیِ کلاس با دبیرِ مدرسهٔ دیگر رد می‌شود (invalid_fk)', first(j).code === 'invalid_fk', JSON.stringify(first(j)));
  }
  /* ۳ — کنترل: سرپرستی با دبیرِ همان مدرسه اعمال می‌شود */
  {
    const sameTeacher = teachers.find(t => Number(t.school_id) === Number(cls.school_id));
    if (sameTeacher) {
      const j = await sync(ckMgr, [op(mgr.id, 'classes', 'upd',
        { homeroom_teacher_id: Number(sameTeacher.id) }, { id: Number(cls.id), base_version: Number(cls.version) || 1 })]);
      chk('سینک: سرپرستی با دبیرِ همان مدرسه اعمال می‌شود (کنترل)', applied(j), JSON.stringify(first(j)));
    } else { chk('سینک: سرپرستی با دبیرِ همان مدرسه اعمال می‌شود (کنترل)', false, 'دبیرِ هم‌مدرسه پیدا نشد'); }
  }
  /* ۴ — لایهٔ دوم: آلودگیِ کاشته‌شده در ذخیره‌ساز + دبیرِ بیگانه */
  {
    const bv = Number(grade.version) || 1;
    const j = await sync(ckForeign, [op(foreignTeacher.id, 'grades', 'upd', { score: '0.25' }, { id: Number(grade.id), base_version: bv })]);
    chk('لایهٔ دوم: دبیرِ بیگانه با برنامهٔ آلوده نمی‌تواند نمرهٔ این مدرسه را عوض کند', first(j).ok === false && /out_of_scope/.test(first(j).code || ''), JSON.stringify(first(j)));
  }
  {
    const att = (seed.attendance || []).find(x => Number(x.student_id) === Number(student));
    const j = await sync(ckForeign, [op(foreignTeacher.id, 'attendance', 'upd', { status: 'absent' }, { id: Number(att.id), base_version: Number(att.version) || 1 })]);
    chk('لایهٔ دوم: دبیرِ بیگانه نمی‌تواند حضورِ این مدرسه را عوض کند', first(j).ok === false && /out_of_scope/.test(first(j).code || ''), JSON.stringify(first(j)));
  }
  {
    const j = await sync(ckForeign, [op(foreignTeacher.id, 'grades', 'del', {}, { id: Number(grade.id), base_version: Number(grade.version) || 1 })]);
    chk('لایهٔ دوم: دبیرِ بیگانه نمی‌تواند نمرهٔ این مدرسه را حذف کند', first(j).ok === false && /out_of_scope/.test(first(j).code || ''), JSON.stringify(first(j)));
  }
  /* ۵ — حلِ تعارضِ سراسری توسطِ مدیر ⇒ رد */
  {
    const r = await req('POST', '/api/sync/resolve-conflict', { conflict_id: GLOBAL_CONFLICT.id, winner: 'incoming' }, ckMgr);
    const list = await req('GET', '/api/sync/conflicts', null, ckMgr);
    const row = ((list.json && list.json.conflicts) || []).find(c => Number(c.id) === GLOBAL_CONFLICT.id);
    chk('حلِ تعارضِ سراسری توسطِ مدیر رد می‌شود و تعارض باز می‌ماند',
      r.status === 403 && row && row.status === 'open', `status=${r.status} conflict=${row && row.status}`);
  }
  /* ۶ — حلِ تعارضِ هم‌مدرسه توسطِ مدیر ⇒ اعمال (کنترل) */
  {
    const r = await req('POST', '/api/sync/resolve-conflict', { conflict_id: OWN_GRADE_CONFLICT.id, winner: 'incoming' }, ckMgr);
    chk('حلِ تعارضِ هم‌مدرسه توسطِ مدیر اعمال می‌شود (کنترل)', r.status === 200, `status=${r.status} ${r.json && r.json.code}`);
  }
  /* ۷ — REST A-21: پوشش با تستِ بالادستی tests/phase-c-unvalidated-fks.js
     (۱۶/۱۶) و پروبِ زندهٔ B2 رویِ PG — ساختِ کلاس در حالتِ حافظه‌ای به
     سامانهٔ شناسهٔ متصل به مرجع نیاز دارد و اینجا موضوعیت ندارد. */

  srv.child.kill('SIGTERM');
  console.log('\n──────────────────────────────────────────');
  console.log(`phase-c-sync-fk-parity: ${pass}/${pass + fail} موفق ${fail === 0 ? '✅' : '❌'}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
