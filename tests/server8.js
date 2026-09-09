#!/usr/bin/env node

/**
 * server8 — پشتیبان‌گیری و بازیابی (OPEN_ITEMS 2.4)
 *
 *   B1  غیر-superadmin (مدیر) → 403 برای backup و restore
 *   B2  superadmin: backup → فایل روی disk، فقط‌داده (بدون __*)، متادیتای درست
 *   B3  نگه‌داری: ۱۲ نسخه → ۱۰ نسخهٔ تازه باقی می‌ماند
 *   B4  بازیابی: تغییرِ بعد از پشتیبان بازمی‌گردد؛ تغییرِ قبلِ پشتیبان می‌ماند
 *   B5  پشتیبانِ خراب → 409 corrupt_backup + store دست‌نخورده
 *   B6  آدیت: backup_created + restore_completed (بهداشتی)
 *
 * اجرا: node tests/server8.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { opX } = require('./helpers/opx');
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
    if (jar && jar.get('csrf_token')) headers['X-CSRF-Token'] = jar.get('csrf_token');
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
    get(k) { return jar[k]; },
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

async function main() {
  console.log('\n▸ پشتیبان‌گیری و بازیابی (OPEN_ITEMS 2.4)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s8-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }); /* پاک‌سازیِ tmp تا /tmp پر نشود */
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const backupsDir = path.join(tmp, 'backups');

  // seedِ قطعی: روزِ امروزِ مدرسهٔ ۱ حضوری باشد (تأثیرِ گاردِ ۱۳.۱ نگیریم)
  const st0 = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const T0 = new Date().toISOString().slice(0, 10);
  if(st0.attendance_modes){
    st0.attendance_modes = st0.attendance_modes.filter(m => !(m.school_id === 1 && m.date === T0 && m.mode === 'virtual'));
    fs.writeFileSync(storeFile, JSON.stringify(st0));
  }

  let port = null, srv = null;
  for (const p of [8991, 8992, 8993]) {
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
  const su = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const mgrJar = await loginAs(su.users.find(u => u.role === 'manager' && u.school_id === 1));
  const saJar = await loginAs(su.users.find(u => u.role === 'superadmin'));
  const nowIso = new Date().toISOString();
  const T = nowIso.slice(0, 10);

  async function syncOps(jar, user, ops) {
    const r = await httpReq(port, 'POST', '/api/sync', { ops }, jar);
    return r;
  }

  // B1: غیر-superadmin
  const mB = await httpReq(port, 'POST', '/api/admin/backup', {}, mgrJar);
  const mR = await httpReq(port, 'POST', '/api/admin/restore', {}, mgrJar);
  chk('B1 مدیر (غیر-superadmin): backup و restore = 403 forbidden',
    mB.status === 403 && mB.json && mB.json.code === 'forbidden' &&
    mR.status === 403 && mR.json && mR.json.code === 'forbidden', mB.raw + ' | ' + mR.raw);

  // B2: superadmin backup
  const b1 = await httpReq(port, 'POST', '/api/admin/backup', {}, saJar);
  const dirFiles0 = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : [];
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(path.join(backupsDir, b1.json && b1.json.file), 'utf8')); } catch (e) {}
  chk('B2a backup: 200 + فایل روی disk با اندازه', b1.status === 200 && b1.json && b1.json.ok === true &&
    typeof b1.json.file === 'string' && b1.json.size > 1000, b1.raw);
  chk('B2b اسنپ‌شات فقط‌داده است (بدون __*) و users کامل',
    !!parsed && !Object.keys(parsed).some(k => k.indexOf('__') === 0) &&
    Array.isArray(parsed.users) && parsed.users.length === su.users.length,
    parsed ? Object.keys(parsed).filter(k => k.indexOf('__') === 0).join(',') : 'parse-fail');

  // B3: نگه‌داری ۱۰ نسخه
  for (let i = 0; i < 11; i++) await httpReq(port, 'POST', '/api/admin/backup', {}, saJar);
  await sleep(100);
  const dirFiles1 = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : [];
  const kept = dirFiles1.filter(f => /^payesh-.*\.json$/.test(f));
  chk('B3 نگه‌داری: ۱۲ نسخه → ۱۰ نسخهٔ تازه', kept.length === 10, 'count=' + kept.length);

  // B4: بازیابی
  // تغییرِ ۱ (قبل از پشتیبان) → پشتیبان → تغییرِ ۲ (بعد) → restore → تغییرِ ۲ می‌رود، تغییرِ ۱ می‌ماند
  await syncOps(saJar, null, [
    opX({ uid: 's8-a', by: 1, collection: 'attendance', type: 'ins', data: { school_id: 1, class_id: 1, student_id: 99901, date: T, status: 'present', note: null } })
  ]);
  const b4 = await httpReq(port, 'POST', '/api/admin/backup', {}, saJar);
  await syncOps(saJar, null, [
    opX({ uid: 's8-b', by: 1, collection: 'attendance', type: 'ins', data: { school_id: 1, class_id: 1, student_id: 99902, date: T, status: 'present', note: null } })
  ]);
  const rest = await httpReq(port, 'POST', '/api/admin/restore', { file: b4.json && b4.json.file }, saJar);
  await sleep(2500); /* persistStore */
  const disk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const has1 = (disk.attendance || []).some(a => a.student_id === 99901);
  const has2 = (disk.attendance || []).some(a => a.student_id === 99902);
  chk('B4a restore: 200 + فایلِ خواسته‌شده', rest.status === 200 && rest.json && rest.json.ok === true && rest.json.file === b4.json.file, rest.raw);
  chk('B4b تغییرِ بعد از پشتیبان رفت + تغییرِ قبلِ پشتیبان ماند', has1 && !has2, 'has1=' + has1 + ' has2=' + has2);

  // B5: پشتیبانِ خراب
  const badName = 'payesh-19990101-000000-000.json';
  fs.writeFileSync(path.join(backupsDir, badName), '{ این یک فایلِ خراب است');
  const restBad = await httpReq(port, 'POST', '/api/admin/restore', { file: badName }, saJar);
  await sleep(2500);
  const disk2 = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  chk('B5 پشتیبانِ خراب: 409 corrupt_backup + store دست‌نخورده',
    restBad.status === 409 && restBad.json && restBad.json.code === 'corrupt_backup' &&
    (disk2.attendance || []).some(a => a.student_id === 99901), restBad.raw);

  // B6: آدیت
  const auditTxt = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  const sa = su.users.find(u => u.role === 'superadmin');
  chk('B6 آدیت: backup_created + restore_completed، بدون phone/nid',
    /backup_created/.test(auditTxt) && /restore_completed/.test(auditTxt) &&
    auditTxt.indexOf(sa.phone) === -1 && auditTxt.indexOf(sa.national_id) === -1,
    auditTxt.slice(-220));

  srv.kill('SIGKILL');
  await sleep(200);

  console.log('\n────────────────────────────────────────────────────────');
  console.log('server8 (پشتیبان‌گیری و بازیابی): ' + (pass + fail) + ' بررسی — ✅ ' + pass + ' · ❌ ' + fail);
  if (errors.length) { console.log('شکست‌ها:'); errors.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
