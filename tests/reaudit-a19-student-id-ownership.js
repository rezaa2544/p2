#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   A-19 — مالکیتِ وابسته به student_id (re-audit مستقلِ adversarial)
   -------------------------------------------------------------------
   سؤالِ مرکزی: آیا پاس دادنِ یک student_idِ خارج از محدودهٔ کاربر در
   بدنهٔ درخواست می‌تواند مالکیت/مرزبندی مدرسه را دور بزند؟

   مسیرهای حمله:
   M1 مدیرِ مدرسهٔ ۱ → POST attendance با student_idِ مدرسهٔ ۳
   M2 مدیرِ مدرسهٔ ۱ → POST grades با student_idِ مدرسهٔ ۳
   M3 دبیر → POST attendance برای دانش‌آموزی که در کلاس‌هایش نیست
   M4 والد → POST attendance با student_idِ فرزندِ دیگری
   M5 مدیر → PATCH attendance برای تغییر student_id به دانش‌آموزِ مدرسهٔ دیگر
   M6 مدیر → PATCH student برای تغییر school_id (انتقالِ بین‌مدرسه‌ای)
   M7 کنترلِ مثبت: مدیر → POST attendance برای دانش‌آموزِ مدرسهٔ خودش ⇒ 200
   M8 خواندن: مدیرِ مدرسهٔ ۱ نمی‌تواند حضورغیابِ مدرسهٔ ۳ را بخواند
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 8971;

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function req(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ 'content-type': 'application/json' },
      data ? { 'content-length': Buffer.byteLength(data) } : {},
      cookie ? { cookie } : {});
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', d => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, body: b, headers: res.headers }); });
    });
    r.on('error', () => resolve({ status: 0, json: null, body: '' }));
    if (data) r.write(data);
    r.end();
  });
}

async function login(phone, store) {
  const st = JSON.parse(fs.readFileSync(store, 'utf8'));
  const u = (st.users || []).find(x => x.phone === phone);
  if (!u) return null;
  const sc = await req('POST', '/api/auth/send-code', { phone });
  const code = sc.json && sc.json.demo_code;
  if (!code) return null;
  const lg = await req('POST', '/api/auth/login', { phone, code, national_id: u.national_id });
  if (lg.status !== 200) return null;
  const cookie = (lg.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  return { cookie, user: u };
}

async function main() {
  console.log('▸ A-19 — مالکیتِ وابسته به student_id (دور زدنِ مرزبندی؟)');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a19-'));
  const tmpStore = path.join(tmpDir, 's.json');
  const srcStore = path.join(ROOT, 'server', 'data', 'payesh.json');
  if (!fs.existsSync(srcStore)) {
    const { execSync } = require('child_process');
    execSync('node server/seed.js', { cwd: ROOT, stdio: 'ignore' });
  }
  fs.copyFileSync(srcStore, tmpStore);

  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: tmpStore,
    PAYESH_AUDIT: path.join(tmpDir, 'a.log'),
    PAYESH_OTP_FILE: path.join(tmpDir, 'otp.json'),
    PAYESH_DEMO_CODE: '1',
    /* assertTenantBoundary is fail-closed without the PostgreSQL authority.
       This documented dev/offline opt-in re-enables the memory-mode path; it
       only relaxes the province authority-attachment gate, NOT the school
       tenant check, so the cross-school assertions below stay meaningful. */
    PAYESH_ALLOW_DEV_MEMORY_AUTHORITY: '1'
  });
  delete env.DATABASE_URL; delete env.REDIS_URL; delete env.NODE_ENV;
  delete env.PAYESH_ENV;

  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => (log += d));
  child.stderr.on('data', d => (log += d));

  let up = false;
  for (let i = 0; i < 120; i++) {
    const h = await req('GET', '/api/health');
    if (h.status === 200) { up = true; break; }
    if (child.exitCode != null) break;
    await sleep(300);
  }
  if (!up) {
    console.log('  ⛔ سرور بالا نیامد:\n' + log.slice(-600));
    try { child.kill('SIGKILL'); } catch (e) {}
    process.exit(2);
  }
  console.log('  سرور روی پورت ' + PORT + ' بالا آمد');

  const st0 = JSON.parse(fs.readFileSync(tmpStore, 'utf8'));
  const mans = (st0.users || []).filter(u => u.role === 'manager');
  const m1 = mans.find(m => Number(m.school_id) === 1);
  const m3 = mans.find(m => Number(m.school_id) === 3);
  const studs = (st0.users || []).filter(u => u.role === 'student');
  const local = studs.find(s => Number(s.school_id) === 1);
  const foreign = studs.find(s => Number(s.school_id) === 3);
  const cls1 = (st0.classes || []).find(c => Number(c.school_id) === 1);
  const cls3 = (st0.classes || []).find(c => Number(c.school_id) === 3);

  const lm1 = await login(m1.phone, tmpStore);
  const lm3 = await login(m3.phone, tmpStore);
  chk('ورودِ مدیرِ مدرسهٔ ۱', !!lm1);
  chk('ورودِ مدیرِ مدرسهٔ ۳', !!lm3);
  if (!lm1 || !lm3) {
    try { child.kill('SIGKILL'); } catch (e) {}
    process.exit(2);
  }

  const SUBJECT = (st0.subjects && st0.subjects[0] && st0.subjects[0].id) || 1;
  const DATE = '2026-09-24';

  /* ── M7 (positive control first) ── */
  const pos = await req('POST', '/api/v1/attendance', {
    student_id: local.id, class_id: cls1.id, date: DATE, status: 'present'
  }, lm1.cookie);
  chk('M7 کنترلِ مثبت: حضورغیابِ دانش‌آموزِ مدرسهٔ خودش ⇒ 2xx', pos.status >= 200 && pos.status < 300, pos.status + ' ' + pos.body.slice(0, 90));
  const posId = pos.json && pos.json.data && pos.json.data.id;

  /* ── M1: cross-school student_id in attendance ── */
  const a1 = await req('POST', '/api/v1/attendance', {
    student_id: foreign.id, class_id: cls1.id, date: DATE, status: 'present'
  }, lm1.cookie);
  chk('M1 مدیرِ ۱ → attendance با student_idِ مدرسهٔ ۳ ⇒ 403',
    a1.status === 403, a1.status + ' ' + a1.body.slice(0, 90));

  /* ── M2: cross-school student_id in grades ── */
  const g1 = await req('POST', '/api/v1/grades', {
    student_id: foreign.id, subject_id: SUBJECT, score: 18
  }, lm1.cookie);
  chk('M2 مدیرِ ۱ → grades با student_idِ مدرسهٔ ۳ ⇒ 403',
    g1.status === 403, g1.status + ' ' + g1.body.slice(0, 90));

  /* ── M2b: same attack through the foreign class_id too ── */
  const a2 = await req('POST', '/api/v1/attendance', {
    student_id: foreign.id, class_id: cls3.id, date: DATE, status: 'present'
  }, lm1.cookie);
  chk('M2b مدیرِ ۱ → attendance با student_id و class_idِ مدرسهٔ ۳ ⇒ 403',
    a2.status === 403, a2.status + ' ' + a2.body.slice(0, 90));

  /* ── M3: teacher cross-class student_id ── */
  const teachers = (st0.users || []).filter(u => u.role === 'teacher' && Number(u.school_id) === 1);
  const lt = teachers.length ? await login(teachers[0].phone, tmpStore) : null;
  if (lt) {
    const tAtt = await req('POST', '/api/v1/attendance', {
      student_id: foreign.id, class_id: cls1.id, date: DATE, status: 'present'
    }, lt.cookie);
    chk('M3 دبیرِ مدرسهٔ ۱ → attendance با student_idِ مدرسهٔ ۳ ⇒ 403',
      tAtt.status === 403, tAtt.status + ' ' + tAtt.body.slice(0, 90));
    /* دانش‌آموزِ هم‌مدرسه اما خارج از کلاسِ دبیر */
    const otherLocal = studs.find(s => Number(s.school_id) === 1 && s.id !== local.id);
    const tAtt2 = await req('POST', '/api/v1/attendance', {
      student_id: otherLocal ? otherLocal.id : local.id, class_id: cls3 ? cls3.id : cls1.id,
      date: DATE, status: 'present'
    }, lt.cookie);
    chk('M3b دبیر → حضورغیاب برای دانش‌آموز/کلاسِ غیرمجاز ⇒ 403',
      tAtt2.status === 403, tAtt2.status + ' ' + tAtt2.body.slice(0, 90));
  } else {
    chk('M3 دبیرِ مدرسهٔ ۱ موجود و ورود موفق', false, 'no school-1 teacher found');
  }

  /* ── M4: parent with a non-child student_id ── */
  const parents = (st0.users || []).filter(u => u.role === 'parent' && Number(u.school_id) === 1);
  const lp = parents.length ? await login(parents[0].phone, tmpStore) : null;
  if (lp) {
    const pAtt = await req('POST', '/api/v1/attendance', {
      student_id: foreign.id, class_id: cls1.id, date: DATE, status: 'present'
    }, lp.cookie);
    chk('M4 والد → attendance با student_idِ مدرسهٔ ۳ ⇒ 403',
      pAtt.status === 403, pAtt.status + ' ' + pAtt.body.slice(0, 90));
  } else {
    chk('M4 والدِ مدرسهٔ ۱ موجود و ورود موفق', false, 'no school-1 parent found');
  }

  /* ── M5: re-point an OWNED attendance record to a foreign student_id ── */
  if (posId != null) {
    const rep = await req('PATCH', '/api/v1/attendance/' + posId, {
      student_id: foreign.id, base_version: 1
    }, lm1.cookie);
    const after = await req('GET', '/api/v1/attendance?student_id=' + foreign.id, null, lm1.cookie);
    const rows = (after.json && after.json.data) || [];
    const leaked = Array.isArray(rows) && rows.some(r => Number(r.id) === Number(posId));
    chk('M5 PATCH برای تغییر student_id به مدرسهٔ دیگر ⇒ رد یا نادیده',
      rep.status === 403 || rep.status === 400 || !leaked, rep.status + ' ' + rep.body.slice(0, 80));
    chk('M5b رکورد به student_idِ خارجی منتقل نشد', !leaked,
      leaked ? 'record now readable under foreign student' : 'record not bound to foreign student');
  } else {
    chk('M5 رکوردِ مثبت برای تستِ انتقال موجود', false, 'positive create failed');
  }

  /* ── M6: manager tries to transfer a student to another school via PATCH ──
     Resolve the real current version first: the strict OCC path rejects a
     wrong base_version with 409, which would mask the field-allowlist check. */
  const stuBefore = (JSON.parse(fs.readFileSync(tmpStore, 'utf8')).users || [])
    .find(u => Number(u.id) === Number(local.id));
  const realBase = stuBefore && (stuBefore.base_version != null ? stuBefore.base_version : stuBefore.version);
  const m6 = await req('PATCH', '/api/v1/students/' + local.id, {
    full_name: 'تست A-19', school_id: 5, base_version: realBase
  }, lm1.cookie);
  const st1 = JSON.parse(fs.readFileSync(tmpStore, 'utf8'));
  const moved = (st1.users || []).find(u => Number(u.id) === Number(local.id));
  chk('M6 PATCH student پذیرفته شد (مسیرِ مجاز اجرا شد)', m6.status >= 200 && m6.status < 300, m6.status + ' ' + m6.body.slice(0, 110));
  chk('M6b school_id به مدرسهٔ ۵ تغییر نکرد (انتقالِ بین‌مدرسه‌ای بسته شد)',
    !(moved && Number(moved.school_id) === 5), 'student school_id is now 5 (cross-school transfer!)');
  const m6data = m6.json && m6.json.data;
  const rb = await req('GET', '/api/v1/students/' + local.id, null, lm1.cookie);
  const rbName = (rb.json && rb.json.data && rb.json.data.full_name) || (m6data && m6data.full_name);
  chk('M6c نام از طریقِ پاسخ/بازخوانیِ HTTP قابلِ به‌روزرسانی است (مسیرِ مجاز سالم است)',
    rbName === 'تست A-19', 'readback full_name=' + JSON.stringify(rbName));

  /* ── M8: read boundary ── */
  const rd = await req('GET', '/api/v1/attendance?limit=500', null, lm1.cookie);
  const rrows = (rd.json && rd.json.data) || [];
  const cross = Array.isArray(rrows) ? rrows.filter(r => Number(r.school_id) === 3) : [];
  chk('M8 مدیرِ ۱ هیچ رکوردِ حضورغیابِ مدرسهٔ ۳ نمی‌بیند',
    cross.length === 0, cross.length + ' foreign rows visible');
  const rd3 = await req('GET', '/api/v1/attendance?limit=500', null, lm3.cookie);
  const r3rows = (rd3.json && rd3.json.data) || [];
  const own3 = Array.isArray(r3rows) ? r3rows.filter(r => Number(r.school_id) === 3).length : 0;
  chk('M8b مدیرِ ۳ رکوردهایِ مدرسهٔ ۳ را می‌بیند (کنترلِ سالم)',
    own3 > 0, '0 rows for own school');

  /* ── M9: student list boundary ── */
  const sl = await req('GET', '/api/v1/students?limit=1000', null, lm1.cookie);
  const srows = (sl.json && sl.json.data) || [];
  const sCross = Array.isArray(srows) ? srows.filter(s => Number(s.school_id) === 3) : [];
  chk('M9 مدیرِ ۱ در لیستِ دانش‌آموزان مدرسهٔ ۳ را نمی‌بیند',
    sCross.length === 0, sCross.length + ' foreign students visible');

  try { child.kill('SIGKILL'); } catch (e) {}
  console.log('\nA-19 (student_id ownership): ' + pass + '/' + (pass + fail) + ' موفق');
  if (fail) console.log('  ⚠ ' + fail + ' مورد شکست خورد');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(3); });
