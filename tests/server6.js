#!/usr/bin/env node

/**
 * server6 — گاردِ روزِ غیرحضوریِ سمتِ سرور (باقی‌ماندهٔ بند ۱۳.۱)
 *
 * آینهٔ سروری از گاردهایِ بند ۱۶ (schoolVirtual):
 *   V1  دستهٔ مخلوط: ثبتِ حضوریِ روزِ غیرحضوری رد می‌شود، بقیهٔ دسته رد می‌شود
 *       (با کدِ virtual_day + پیامِ فارسی) و excused و روزِ حضوری پذیرفته می‌شوند
 *   V2  روی disk: رکوردِ مسدود نوشته نشده + دو رکوردِ مجاز نوشته شده‌اند
 *   V3  امانتِ کتابِ روزِ غیرحضوری → رد
 *   V4  ثبتِ مهمانِ روزِ غیرحضوری → رد
 *   V5  «in_use» تجهیزِ روزِ غیرحضوری → رد؛ وضعیتِ غیرِ فیزیکی → پذیرفته
 *   V6  جریانِ کلاسِ مجازی (vclass_attendance) دست‌نخورده است
 *   V7  رویدادِ sync_virtual_day_blocked در آدیت
 *
 * اجرا: node tests/server6.js
 */
const fs = require('fs');
const { opX } = require('./helpers/opx');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, jar) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (jar) headers['Cookie'] = jar.headers().join('; ');
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        if (jar) jar.absorb(res.headers);
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json: j, raw: b });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, json: null, raw: '' }));
    if (data) req.write(data);
    req.end();
  });
}
function makeJar() {
  const jar = {};
  return {
    headers() { return Object.keys(jar).map((k) => k + '=' + jar[k]); },
    absorb(h) {
      const sc = h['set-cookie'];
      if (!sc) return;
      sc.forEach((c) => {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      });
    }
  };
}
const p2 = (n) => String(n).padStart(2, '0');
function dayISO(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
const T = dayISO(new Date());
const Y = dayISO(new Date(Date.now() - 86400000));

async function main() {
  console.log('\n▸ گاردِ روزِ غیرحضوری — سمتِ سرور (بند ۱۳.۱)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s6-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }); /* پاک‌سازیِ tmp تا /tmp پر نشود */
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');

  // seedِ قطعی: امروزِ مدرسهٔ ۱ = غیرحضوری؛ دیروز = حضوری؛ رکوردِ امروز/دیروزِ دانش‌آموز ۱۶ پاک
  const st = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  st.attendance = (st.attendance || []).filter(a => !(a.student_id === 16 && (a.date === T || a.date === Y)));
  st.attendance_modes = (st.attendance_modes || []).filter(m => !(m.school_id === 1 && (m.date === T || m.date === Y)));
  st.attendance_modes.push({ school_id: 1, date: T, mode: 'virtual' });
  fs.writeFileSync(storeFile, JSON.stringify(st));
  const mgr = st.users.find(u => u.role === 'manager' && u.school_id === 1);
  const tea = st.users.find(u => u.role === 'teacher' && u.school_id === 1);

  // boot با guard بر pid
  let port = null, srv = null;
  for (const p of [8971, 8972, 8973]) {
    const s = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile, PAYESH_KEY: keyFile, PAYESH_DEMO_CODE: '1'
      }),
      stdio: 'pipe'
    });
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpReq(p, 'GET', '/api/health').then((r) => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break;
      await sleep(300);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  chk('A0 سرور بالا آمد (با pidِ خودِ این spawn)', port !== null);
  if (port === null) { console.log('  ⚠ بدون سرور، ادامه ممکن نیست'); process.exit(1); }

  async function loginAs(u) {
    const jar = makeJar();
    const send = await httpReq(port, 'POST', '/api/auth/send-code', { phone: u.phone }, jar);
    const code = send.json && send.json.demo_code;
    await httpReq(port, 'POST', '/api/auth/login', { phone: u.phone, code: String(code || ''), national_id: u.national_id }, jar);
    return jar;
  }
  const mgrJar = await loginAs(mgr);
  const teaJar = await loginAs(tea);
  const nowIso = new Date().toISOString();

  async function syncOps(jar, user, school, ops) {
    const r = await httpReq(port, 'POST', '/api/sync', {
      ops: ops.map(o => Object.assign({ user_id: user, school_id: school, at: nowIso }, o))
    }, jar);
    return r;
  }

  // V1: دستهٔ مخلوط
  const mixed = await syncOps(mgrJar, mgr.id, 1, [
    opX({ uid: 'v6-1', by: mgr.id, collection: 'attendance', type: 'ins', data: { school_id: 1, class_id: 1, student_id: 16, date: T, status: 'present', note: null } }),
    opX({ uid: 'v6-2', by: mgr.id, collection: 'attendance', type: 'ins', data: { school_id: 1, class_id: 1, student_id: 16, date: T, status: 'excused', note: 'مرخصی' } }),
    opX({ uid: 'v6-3', by: mgr.id, collection: 'attendance', type: 'ins', data: { school_id: 1, class_id: 1, student_id: 16, date: Y, status: 'present', note: null } })
  ]);
  const res = (mixed.json && mixed.json.results) || [];
  const r1 = res.find(x => x.uid === 'v6-1') || {};
  chk('V1a ثبتِ حضوریِ روزِ غیرحضوری رد شد (virtual_day + پیامِ فارسی)',
    mixed.status === 200 && r1.ok === false && r1.code === 'virtual_day' && r1.message && r1.message.indexOf('غیرحضوری') !== -1, mixed.raw.slice(0, 200));
  chk('V1b بقیهٔ دسته رد شد: excused + روزِ حضوری پذیرفته',
    ((res.find(x => x.uid === 'v6-2') || {}).ok) === true &&
    ((res.find(x => x.uid === 'v6-3') || {}).ok) === true, mixed.raw.slice(0, 200));

  // V2: disk (persistStore هر ۲ ثانیه است — صبرِ کامل از دورهٔ بعدی)
  await sleep(2500);
  const disk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const rows16 = (disk.attendance || []).filter(a => a.student_id === 16 && (a.date === T || a.date === Y));
  chk('V2 روی disk: رکوردِ مسدود نیست + excused و روزِ حضوری هست',
    !rows16.some(a => a.date === T && a.status === 'present') &&
    rows16.some(a => a.date === T && a.status === 'excused') &&
    rows16.some(a => a.date === Y && a.status === 'present'), JSON.stringify(rows16.map(a => a.date + ':' + a.status)));

  // V3: امانت کتاب
  const loan = await syncOps(mgrJar, mgr.id, 1, [
    opX({ uid: 'v6-4', by: mgr.id, collection: 'lib_loans', type: 'ins', data: { school_id: 1, book_id: 1, student_id: 16, loan_at: T + 'T10:00:00.000Z', due_at: Y + 'T10:00:00.000Z', returned_at: '', registered_by: mgr.id } })
  ]);
  chk('V3 امانتِ کتابِ روزِ غیرحضوری رد شد',
    (((loan.json && loan.json.results) || [{}]).find(x => x.uid === 'v6-4') || {}).code === 'virtual_day', loan.raw.slice(0, 200));

  // V4: مهمان
  const vis = await syncOps(mgrJar, mgr.id, 1, [
    opX({ uid: 'v6-5', by: mgr.id, collection: 'visitors', type: 'ins', data: { school_id: 1, name: 'مهمانِ تستی', purpose: '', in_at: T + 'T09:00:00.000Z', out_at: '', registered_by: mgr.id } })
  ]);
  chk('V4 ثبتِ مهمانِ روزِ غیرحضوری رد شد',
    (((vis.json && vis.json.results) || [{}]).find(x => x.uid === 'v6-5') || {}).code === 'virtual_day', vis.raw.slice(0, 200));

  // V5: تجهیز
  const asset = await syncOps(mgrJar, mgr.id, 1, [
    opX({ uid: 'v6-6', by: mgr.id, collection: 'assets', type: 'upd', id: 2, data: { status: 'in_use' } }),
    opX({ uid: 'v6-7', by: mgr.id, collection: 'assets', type: 'upd', id: 2, data: { status: 'available' } })
  ]);
  const ares = (asset.json && asset.json.results) || [];
  chk('V5 «in_use» تجهیز مسدود + وضعیتِ غیرِ فیزیکی پذیرفته',
    ((ares.find(x => x.uid === 'v6-6') || {}).code) === 'virtual_day' &&
    ((ares.find(x => x.uid === 'v6-7') || {}).ok) === true, asset.raw.slice(0, 200));

  // V6: کلاسِ مجازی دست‌نخورده
  const vc = await syncOps(teaJar, tea.id, 1, [
    opX({ uid: 'v6-8', by: tea.id, collection: 'vclass_attendance', type: 'ins', data: { session_id: 1, student_id: 16, joined_at: nowIso, left_at: '', by: tea.id } })
  ]);
  chk('V6 جریانِ کلاسِ مجازی (vclass_attendance) دست‌نخورده است',
    (((vc.json && vc.json.results) || [{}]).find(x => x.uid === 'v6-8') || {}).ok === true, vc.raw.slice(0, 200));

  // V7: audit
  await sleep(200);
  const auditTxt = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  chk('V7 sync_virtual_day_blocked در آدیت ثبت شد', /sync_virtual_day_blocked/.test(auditTxt), auditTxt.slice(-200));

  srv.kill('SIGKILL');
  await sleep(200);

  console.log('\n────────────────────────────────────────────────────────');
  console.log('server6 (گاردِ غیرحضوریِ سرور): ' + (pass + fail) + ' بررسی — ✅ ' + pass + ' · ❌ ' + fail);
  if (errors.length) { console.log('شکست‌ها:'); errors.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
