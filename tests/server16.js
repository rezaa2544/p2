#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server16 — ماتریسِ منفیِ مجوز + تزریقِ فیلد + IDOR (R96, P0-1/2/6)
   ───────────────────────────────────────────────────────────────────
   M1  ماتریسِ نقش×مجموعه×عمل — رفتارِ سرور = مجوزِ مدلِ authz
       (ins/upd/del برایِ همهٔ نقش‌ها روی مجموعه‌هایِ پرورده)
   M2  end-to-endِ مثبت: نویسندهٔ واقعیِ هر کارکرد، رکوردِ سالم
   M3  تزریق: role/phone/national_id/isAdmin/version/status غیرواقعی
   M4  school_id از خارج + مالکیتِ جعلی (ownership forge)
   M5  IDORِ بین‌مدرسه (خوانش /api/students/:id + نوشتنِ scope)
   M6  audit: sync_authz_fail / sync_field_gate برایِ رد‌ها ثبت شد
   اجرا: node tests/server16.js   (پورت‌هایِ ثابت: 9003)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const MODEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'model.json'), 'utf8'));
const PORT = 9003;

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tmp = null, server = null;
process.on('exit', () => { try { if (server) server.kill('SIGKILL'); } catch (e) {} try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

function httpReq(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        cookie ? { Cookie: cookie } : {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers });
      });
    });
    req.on('error', () => resolve({ status: 0, json: null, headers: {} }));
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s16-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(REAL_STORE, storeFile);
  const auditFile = path.join(tmp, 'audit.log');

  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile,
    PAYESH_KEY: path.join(tmp, 'jwt.key'), PAYESH_DEMO_CODE: '1'
  });
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'pipe' });
  let booted = false;
  for (let i = 0; i < 50; i++) {
    const h = await httpReq('GET', '/api/health');
    if (h.status === 200 && h.json && h.json.ok) {
      if (h.json.pid === server.pid) { booted = true; break; }
      try { process.kill(h.json.pid); } catch (e) {} /* سرورِ ماندهٔ اجرایِ پیشین — کُشته شود */
    }
    if (server.exitCode !== null) break;
    await sleep(300);
  }
  chk('M0 سرور بالا آمد (9003)', booted);
  if (!booted) return;

  /* ── کاربران (از seed) ─────────────────────────────────────────── */
  const seed = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const U = (id) => seed.users.find(u => u.id === id);
  const CAST = {
    sa: U(1), m1: U(2), m2: U(244), t1: U(4), st: U(16),
    p: U(17), co: U(1030), dr: U(1035), eo: U(1026)
  };

  async function login(u) {
    const sc = await httpReq('POST', '/api/auth/send-code', { phone: String(u.phone).replace(/[\s\-()]/g, '') });
    const code = sc.json && sc.json.demo_code;
    const lg = await httpReq('POST', '/api/auth/login', { phone: String(u.phone).replace(/[\s\-()]/g, ''), code, national_id: u.national_id });
    if (!(lg.json && lg.json.ok)) return null;
    const sc2 = lg.headers['set-cookie'];
    return Array.isArray(sc2) ? sc2[0].split(';')[0] : (sc2 || '').split(';')[0];
  }
  const C = {};
  for (const k of Object.keys(CAST)) C[k] = await login(CAST[k]);
  chk('M0 نه نشستِ واقعی (8 نقش)', Object.values(C).every(Boolean), JSON.stringify(Object.keys(C).filter(k => !C[k])));

  let seq = 0;
  async function syncOps(ck, ops) {
    return httpReq('POST', '/api/sync', { ops: ops.map(o => Object.assign({ uid: 's16-' + (++seq) }, o)) }, ck);
  }
  const res0 = (r) => (r.json && r.json.results && r.json.results[0]) || {};
  const isPermit = (r) => { const c = res0(r).code; return c !== 'role_denied' && c !== 'unknown_collection'; };

  /* ── M1 ماتریسِ نقش×مجموعه×عمل (رفتار = مدل) ──────────────────── */
  console.log('\n— M1 ماتریسِ مجوز (سرور = مدل) —');
  const PROBE = ['grades','users','attendance','messages','hw_submissions','leaves','announcements',
    'exam_terms','meetings'.replace('meetings','meeting_slots'),'corrections','parent_verifications',
    'counselor_msgs','bus_events','bus_needs','notify_queue','certificates','installments','vclass_sessions','pre_enrollments'];
  const roles = ['sa','m1','t1','st','p','co','dr','eo'];
  let m1checks = 0;
  let m1skipped = 0;
  let m1bad = [];
  const KID = CAST.st.id;
  const CAST_IDS = new Set(Object.values(CAST).map(u => u.id));
  /* دادهٔ probe باید inScope را هم بگذراند:
     student/parent/teacher روی رکوردِ فرزندِ کلاسِ خود (KID در کلاسِ T1) */
  const probeData = (role, def) => {
    const d = {};
    if ((def.fields || []).indexOf('school_id') > -1) d.school_id = 1;
    /* student/parent/teacher روی فرزندِ کلاسِ خود؛ manager رویِ رشتهٔ
       student (برایِ مجموعه‌هایِ بدونِ school_id) — فقط اگر فیلدش هست */
    if ((role === 'student' || role === 'parent' || role === 'teacher' || role === 'manager')
        && (def.fields || []).indexOf('student_id') > -1) d.student_id = KID;
    /* کلاس‌محور (vclass_sessions/hw_assignments): ت1 دبیرِ cls1 است */
    if (role === 'teacher' && (def.fields || []).indexOf('class_id') > -1) d.class_id = 1;
    return d;
  };
  /* رکوردهایِ در-scopeٔ هر نقش (mirrorِ inScope) — برایِ del هر نقش رکوردِ
     جدا می‌گیرد تا حذفِ یک نقش، سلول‌هایِ دیگر را نکُشد؛ users: هرگز
     کاربرِ cast حذف نمی‌شود (نشست‌ها می‌میرند). */
  const enrSchool = (r) => {
    if (r.student_id == null) return null;
    const enr = (seed.enrollments || []).find(e => e.student_id === Number(r.student_id));
    const cls = enr && (seed.classes || []).find(c => c.id === enr.class_id);
    return cls ? Number(cls.school_id) : null;
  };
  const recsFor = (role, coll, def) => {
    const hasSchool = (def.fields || []).indexOf('school_id') > -1;
    let list = (seed[coll] || []).filter(r => hasSchool ? Number(r.school_id) === 1 : enrSchool(r) === 1);
    if (coll === 'users') list = list.filter(r => !CAST_IDS.has(r.id));
    if (coll === 'messages' && role === 'teacher') list = list.filter(r => Number(r.from_id) === CAST.t1.id);
    if (role === 'student' || role === 'parent') list = list.filter(r => Number(r.student_id) === KID || r.parent_id === CAST.p.id);
    if (role === 'teacher') list = list.filter(r => (r.student_id == null || Number(r.student_id) === KID) && (r.teacher_id == null || Number(r.teacher_id) === CAST.t1.id));
    return list;
  };
  for (const coll of PROBE) {
    const def = MODEL.collections[coll];
    if (!def) continue;
    /* del بعد از همهٔ ins/upd — و داخلِ del: رد‌ها اول (بدونِ تغییر)،
       بعد یک delِ مجازِ نماینده (باقی‌های مجاز: covered — رکوردِ probe
       فقط یکی است و del نابودکننده است). */
    let permitDelDone = false;
    for (const op of ['ins', 'upd', 'del']) {
      const order = op === 'del'
        ? roles.filter(rk => !(def.del || []).includes(CAST[rk].role))
          .concat(roles.filter(rk => (def.del || []).includes(CAST[rk].role)))
        : roles;
      for (const rk of order) {
        const role = CAST[rk].role;
        const allowed = (def[op] || []).includes(role);
        if (op === 'del' && allowed && permitDelDone) { m1skipped++; continue; }
        let r = null;
        if (op === 'ins') {
          const d = probeData(role, def);
          if (coll === 'messages') d.from_id = CAST[rk].id; /* msgOwnerOk */
          r = await syncOps(C[rk], [{ t: 'ins', c: coll, by: CAST[rk].id, data: d }]);
        } else {
          const list = recsFor(role, coll, def);
          const rec = list[0];
          if (!rec) { m1skipped++; continue; }
          if (op === 'upd') r = await syncOps(C[rk], [{ t: 'upd', c: coll, id: rec.id, by: CAST[rk].id, data: probeData(role, def) }]);
          else {
            r = await syncOps(C[rk], [{ t: 'del', c: coll, id: rec.id, by: CAST[rk].id }]);
            if (allowed && res0(r).ok === true) permitDelDone = true;
          }
        }
        m1checks++;
        const code = res0(r).code;
        const ok = allowed
          ? (r.status === 200 && isPermit(r))
          : (r.status === 403 || code === 'role_denied'); /* out_of_scope هم «رد» است */
        if (!ok) m1bad.push(role + '×' + coll + '×' + op + ' → ' + r.status + '/' + code + (allowed ? ' (باید مجاز بود)' : ' (باید رد می‌شد)'));
      }
    }
  }
  chk('M1 ماتریس ' + m1checks + ' سلول فعال (' + m1skipped + ' رد) = مدل', m1bad.length === 0, m1bad.slice(0, 8).join(' | '));

  /* مجموعهٔ ناشناخته — حتی superadmin */
  const ru = await syncOps(C.sa, [{ t: 'ins', c: 'totally_unknown', by: 1, data: {} }]);
  chk('M1b مجموعهٔ ناشناخته → unknown_collection (حتی superadmin)', res0(ru).code === 'unknown_collection', JSON.stringify(res0(ru)));

  /* ── M2 end-to-endِ مثبت — نویسندهٔ واقعی، دادهٔ کامل ─────────── */
  console.log('\n— M2 مسیرهایِ واقعیِ سالم —');
  const now = new Date().toISOString();
  let r;
  r = await syncOps(C.t1, [{ t: 'ins', c: 'grades', by: CAST.t1.id, data: { school_id: 1, student_id: CAST.st.id, class_id: 1, subject_id: 1, term: 'R96', score: 12, max_score: 20 } }]);
  chk('M2a دبیر: grades → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.st, [{ t: 'ins', c: 'hw_submissions', by: CAST.st.id, data: { assignment_id: 1, student_id: CAST.st.id, file_key: 'r96', file_name: 'a.png', mime: 'image/png', size: 10, score: null, submitted_at: now } }]);
  chk('M2b دانش‌آموز: hw_submissions → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.st, [{ t: 'ins', c: 'messages', by: CAST.st.id, data: { school_id: 1, from_id: CAST.st.id, to_id: CAST.m1.id, body: 'سلام' } }]);
  chk('M2c دانش‌آموز: messages (from_id خود) → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.t1, [{ t: 'ins', c: 'attendance', by: CAST.t1.id, data: { school_id: 1, student_id: CAST.st.id, date: '2026-09-08', status: 'present' } }]);
  chk('M2d دبیر: attendance status=present → ok (نویسندهٔ اصلی)', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.t1, [{ t: 'ins', c: 'meeting_slots', by: CAST.t1.id, data: { school_id: 1, teacher_id: CAST.t1.id, date: '2026-09-10', start_time: '09:00', duration: 30, location: 'دفتر', status: 'open', created_at: now } }]);
  chk('M2e دبیر: meeting_slots status=open → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.p, [{ t: 'ins', c: 'corrections', by: CAST.p.id, data: { school_id: 1, student_id: CAST.st.id, parent_id: CAST.p.id, message: 'R96', status: 'open', created_at: now } }]);
  chk('M2f والد: corrections status=open → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.p, [{ t: 'ins', c: 'parent_verifications', by: CAST.p.id, data: { student_id: CAST.st.id, status: 'pending' } }]);
  chk('M2g والد: parent_verifications pending → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.co, [{ t: 'ins', c: 'counselor_msgs', by: CAST.co.id, data: { school_id: 1, author_id: CAST.co.id, student_id: CAST.st.id, body: 'جلسه', status: 'open' } }]);
  chk('M2h مشاور: counselor_msgs → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.dr, [{ t: 'ins', c: 'bus_events', by: CAST.dr.id, data: { school_id: 1, route_id: 1, student_id: CAST.st.id, type: 'board', at: now } }]);
  chk('M2i راننده: bus_events → ok', res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.m1, [{ t: 'ins', c: 'users', by: CAST.m1.id, data: { school_id: 1, role: 'student', full_name: 'R96 تست', username: 'r96user', password: '123456', national_id: '1234567890', phone: '09120000000', active: 1, created_at: now } }]);
  chk('M2j مدیر: users + password (ساختِ کاربر) → ok', res0(r).ok === true, JSON.stringify(res0(r)));

  /* ── M3 تزریقِ فیلد ────────────────────────────────────────────── */
  console.log('\n— M3 تزریق —');
  r = await syncOps(C.st, [{ t: 'ins', c: 'grades', by: CAST.st.id, data: { school_id: 1, student_id: CAST.st.id, class_id: 1, subject_id: 1, term: 'x', score: 1, role: 'superadmin', isAdmin: true } }]);
  chk('M3a student: grades+role/isAdmin → رد (role_denied یا unknown_field)', ['role_denied','unknown_field'].includes(res0(r).code), JSON.stringify(res0(r)));
  r = await syncOps(C.p, [{ t: 'ins', c: 'users', by: CAST.p.id, data: { school_id: 1, role: 'manager', full_name: 'x', username: 'x', password: '1', national_id: '1', phone: '2' } }]);
  chk('M3b parent: users+role=manager → رد', r.status === 403 || ['role_denied', 'role_escalation', 'out_of_scope'].includes(res0(r).code), r.status + ' ' + JSON.stringify(res0(r)));
  r = await syncOps(C.m1, [{ t: 'ins', c: 'users', by: CAST.m1.id, data: { school_id: 1, role: 'superadmin', full_name: 'x', username: 'x' } }]);
  chk('M3c manager: users role=superadmin → role_escalation', res0(r).code === 'role_escalation', JSON.stringify(res0(r)));
  /* قفلِ فیلدیِ phone/nid دفاعِ دوم است (users.upd فقط مدیر/superadmin —
     همهٔ آن‌ها معافند)؛ خطِ اول role_denied است. */
  r = await syncOps(C.t1, [{ t: 'upd', c: 'users', id: CAST.t1.id, by: CAST.t1.id, data: { phone: '09990000000' } }]);
  chk('M3d teacher: users.phone → role_denied (خطِ اول)', res0(r).code === 'role_denied', JSON.stringify(res0(r)));
  r = await syncOps(C.st, [{ t: 'upd', c: 'users', id: CAST.st.id, by: CAST.st.id, data: { national_id: '9999999999' } }]);
  chk('M3e student: users.national_id → role_denied (خطِ اول)', res0(r).code === 'role_denied', JSON.stringify(res0(r)));
  const { fieldGate } = require(path.join(ROOT, 'server', 'sync.js'));
  chk('M3e2 fieldGate: superadmin روی users.phone آزاد است (defense-in-depth معاف)',
    fieldGate({ t: 'upd', c: 'users', id: 1, data: { phone: '09990000000' } }, { role: 'superadmin', id: 1, school_id: null, name: 'x' }) === null);
  r = await syncOps(C.m1, [{ t: 'ins', c: 'grades', by: CAST.m1.id, data: { school_id: 1, student_id: CAST.st.id, class_id: 1, subject_id: 1, term: 'x', score: 1, version: 999999 } }]);
  chk('M3f manager: grades+version → unknown_field (سرور مدیریت می‌کند)', res0(r).code === 'unknown_field', JSON.stringify(res0(r)));
  r = await syncOps(C.t1, [{ t: 'ins', c: 'grades', by: CAST.t1.id, data: { school_id: 1, student_id: CAST.st.id, class_id: 1, subject_id: 1, term: 'x', score: 1, secret_payload: '<script>' } }]);
  chk('M3g teacher: grades+فیلدِ غیرواقعی → unknown_field', res0(r).code === 'unknown_field', JSON.stringify(res0(r)));
  r = await syncOps(C.p, [{ t: 'ins', c: 'leaves', by: CAST.p.id, data: { school_id: 1, student_id: CAST.st.id, from_date: '2026-09-10', to_date: '2026-09-10', reason: 'x', status: 'approved' } }]);
  chk('M3h parent: leaves status=approved → field_denied (خودتأیید ممنوع)', res0(r).code === 'field_denied', JSON.stringify(res0(r)));
  r = await syncOps(C.st, [{ t: 'upd', c: 'meeting_slots', id: 1, by: CAST.st.id, data: { status: 'booked', parent_id: CAST.p.id } }]);
  chk('M3i student: meeting_slots.status → رد', r.status === 403 || ['role_denied', 'field_denied', 'out_of_scope'].includes(res0(r).code), r.status + ' ' + JSON.stringify(res0(r)));
  /* والد: رزرو نوبت — transitionِ مجاز */
  const msRec = (seed.meeting_slots || [])[0] || {};
  /* نوبتِ تازهٔ M2e (دبیرِ T1، بدونِ رزرو) */
  const msRec2 = { id: null };
  {
    /* id از پاسخِ M2e نمی‌آید؛ از store بعد از persist بخوان (تازه‌ترین) */
    await sleep(2600);
    const msList = JSON.parse(fs.readFileSync(storeFile, 'utf8')).meeting_slots || [];
    msRec2.id = msList[msList.length - 1].id;
  }
  r = await syncOps(C.p, [{ t: 'upd', c: 'meeting_slots', id: msRec2.id, by: CAST.p.id, data: { status: 'booked', student_id: KID } }]);
  chk('M3i2 والد: meeting_slots.status=booked → اجازه (کارکردِ رزرو)', r.status === 200 && res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(C.st, [{ t: 'ins', c: 'users', by: CAST.st.id, data: { school_id: 1, role: 'student', full_name: 'x', username: 'x', password: '1' } }]);
  chk('M3j student: users+password → رد', r.status === 403 || ['role_denied', 'out_of_scope'].includes(res0(r).code), r.status + ' ' + JSON.stringify(res0(r)));
  r = await syncOps(C.m1, [{ t: 'ins', c: 'grades', by: CAST.m1.id, data: { school_id: 1, student_id: CAST.st.id, class_id: 1, subject_id: 1, term: 'x', score: 1, status: 'whatever' } }]);
  chk('M3k manager: grades status=whatever → unknown_field (status فیلدِ grades نیست)', res0(r).code === 'unknown_field', JSON.stringify(res0(r)));
  r = await syncOps(C.t1, [{ t: 'ins', c: 'meeting_slots', by: CAST.t1.id, data: { school_id: 1, teacher_id: CAST.t1.id, date: '2026-09-11', start_time: '10:00', duration: 30, location: 'x', status: 'closed', created_at: now } }]);
  chk('M4x teacher: meeting_slots status=closed (غیرِ اولیّه) → field_denied', res0(r).code === 'field_denied', JSON.stringify(res0(r)));

  /* ── M4 school_id + مالکیت ─────────────────────────────────────── */
  console.log('\n— M4 scope و مالکیت —');
  r = await syncOps(C.m1, [{ t: 'ins', c: 'grades', by: CAST.m1.id, data: { school_id: 2, student_id: 258, class_id: 1, subject_id: 1, term: 'x', score: 1 } }]);
  chk('M4a مدیرِ مدرسهٔ 1: ins school_id=2 → 403 out_of_scope', r.status === 403 && r.json && r.json.code === 'out_of_scope', r.status + ' ' + JSON.stringify(r.json));
  r = await syncOps(C.m2, [{ t: 'upd', c: 'grades', id: (seed.grades.find(g => Number(g.school_id) === 1) || {}).id, by: CAST.m2.id, data: { school_id: 1, score: 99 } }]);
  chk('M4b مدیرِ مدرسهٔ 2: upd رکوردِ مدرسهٔ 1 → 403 out_of_scope', r.status === 403 && r.json && r.json.code === 'out_of_scope', r.status + ' ' + JSON.stringify(r.json));
  /* messages: inScope (مالکیتِ from_id) پیش از fieldGate می‌رسد —
     رد می‌شود با out_of_scope (هر دو «رد»؛ ownership_forge برای
     collectionهایی است که inScope صنفی است). */
  r = await syncOps(C.st, [{ t: 'ins', c: 'messages', by: CAST.st.id, data: { school_id: 1, from_id: CAST.m1.id, to_id: CAST.m1.id, body: 'جعله' } }]);
  chk('M4c student: messages from_id=مدیر → رد (out_of_scope)', r.status === 403 || res0(r).code === 'out_of_scope' || res0(r).code === 'ownership_forge', r.status + ' ' + JSON.stringify(res0(r)));
  /* hw: رکوردِ تکلیفِ خودِ KID (T1 دبیرِ کلاسِ اوست) — graded_byِ جعلی
     (M2b تازه نوشتش — صبرِ persist تا روی disk باشد) */
  await sleep(2600);
  const hwNow = JSON.parse(fs.readFileSync(storeFile, 'utf8')).hw_submissions || [];
  const hwRec = hwNow.filter(h => Number(h.student_id) === KID).slice(-1)[0] || hwNow[0] || {};
  if (hwRec.id) {
    r = await syncOps(C.t1, [{ t: 'upd', c: 'hw_submissions', id: hwRec.id, by: CAST.t1.id, data: { score: 10, graded_by: CAST.t1.id + 1000 } }]);
    chk('M4d teacher: hw graded_by=دبیرِ دیگر → ownership_forge', res0(r).code === 'ownership_forge', JSON.stringify(res0(r)));
  } else chk('M4d teacher: hw graded_by → ownership_forge', false, 'رکورد نیست');
  r = await syncOps(C.co, [{ t: 'ins', c: 'counselor_msgs', by: CAST.co.id, data: { school_id: 1, author_id: CAST.st.id, student_id: CAST.st.id, body: 'جعله', status: 'open', author_role: 'student' } }]);
  chk('M4e مشاور: counselor_msgs author_role=student (جعله) → ownership_forge', res0(r).code === 'ownership_forge', JSON.stringify(res0(r)));

  /* ── M5 IDOR خوانش (/api/students/:id) ────────────────────────── */
  console.log('\n— M5 IDOR خوانش —');
  const kid = CAST.st.id;
  let rr = await httpReq('GET', '/api/students/' + kid, null, C.p);
  chk('M5a والدِ فرزند: /api/students/:id → 200', rr.status === 200, rr.status);
  const otherParent = U(19);
  C.op = await login(otherParent);
  rr = await httpReq('GET', '/api/students/' + kid, null, C.op);
  chk('M5b والدِ بی‌ربط: /api/students/:id → 404 (نه 403 — enum guard)', rr.status === 404, rr.status);
  rr = await httpReq('GET', '/api/students/' + kid, null, C.m2);
  chk('M5c مدیرِ مدرسهٔ دیگر: /api/students/:id → 404', rr.status === 404, rr.status);

  /* ── M6 audit — رد‌هایِ مجوز ثبت شده‌اند، رمز/کد ملی نه ───────── */
  await sleep(700);
  const auditTxt = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  chk('M6a audit: sync_authz_fail ثبت شد', auditTxt.indexOf('sync_authz_fail') > -1);
  chk('M6b audit: sync_field_gate ثبت شد', auditTxt.indexOf('sync_field_gate') > -1);
  chk('M6c audit: هیچ phone کاملی در audit نیست', !/09999\d{6}/.test(auditTxt.replace(/"user_id":\d+/g, '')));

  server.kill('SIGKILL');
  console.log('\n' + '─'.repeat(52));
  console.log(`server16: ${pass} سبز / ${fail} قرمز` + (fail ? ' ❌' : ' ✅'));
  errors.slice(0, 10).forEach(e => console.log('   ' + e));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
