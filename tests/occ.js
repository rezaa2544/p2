#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   P0-18 — کنترل همزمانی خوش‌بینانه (OCC) در همهٔ مسیرها
   ۱) هِلپر: بدون نسخه ⇒ سازگاری؛ نسخهٔ درست ⇒ ادامه؛ کهنه ⇒ ۴۰۹
   ۲) هر دو نام پایه (base_version و version) پذیرفته می‌شود
   ۳) کلاس: نوشتِ کهنه ۴۰۹ می‌گیرد و نسخهٔ سرور برمی‌گردد
   ۴) حضور و غیاب: نسخهٔ کهنه دیگر بی‌بررسی بالا نمی‌رود → ۴۰۹
   ۵) دو نوشتِ همزمان با پایهٔ یکسان → دقیقاً یکی ۲۰۰، دیگری ۴۰۹
   ۶) نوشتِ بدون نسخه (کلاینت کهنه) می‌گذرد و نسخه را بالا می‌برد
   اجرا:  node tests/occ.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const { checkOcc, bump } = require(path.join(ROOT, 'server', 'occ.js'));

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('▸ P0-18 — کنترل همزمانی خوش‌بینانه');

  // ۱+۲) رفتار هِلپر
  {
    const rec = { id: 1, version: 3 };
    chk('بدون پایه ⇒ سازگاری (ادامه)', checkOcc(rec, {}) === null && checkOcc(rec, null) === null);
    chk('پایهٔ درست ⇒ ادامه', checkOcc(rec, { base_version: 3 }) === null && checkOcc(rec, { version: 3 }) === null);
    const c1 = checkOcc(rec, { base_version: 2 }, 'کلاس');
    chk('پایهٔ کهنه ⇒ ۴۰۹', !!(c1 && c1.status === 409 && c1.body.code === 'conflict'));
    chk('نسخهٔ سرور در پاسخ است', c1 && c1.body.server_version === 3);
    chk('پیام فارسی دارد', c1 && String(c1.body.message).indexOf('تازه کنید') !== -1);
    const before = rec.version;
    const nv = bump(rec);
    chk('بامپ نسخه را بالا می‌برد', nv === before + 1 && rec.version === before + 1 && !!rec.updated_at);
  }

  // ۳ تا ۶) رفتار واقعی سرور
  {
    const PORT = 8965;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-occ-'));
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
      PAYESH_KEY: path.join(tmpDir, 'k.key'),
      PAYESH_DEMO_CODE: '1'
    });
    /* F-A7 (Arena 1): the test targets the CI/dev FILE-store server. The server
       treats DATABASE_URL as production-equivalent (index.js readiness gate),
       so a shell-exported DATABASE_URL + deleted REDIS_URL (B5 fail-closed)
       FATAL'd the child before health came up — then the already-exited child
       made the exit-wait below hang, the event loop drained, and Node
       NATURALLY exited 0 with a ❌ printed (fake-green, exit-0-despite-❌). */
    delete env.NODE_ENV; delete env.REDIS_URL; delete env.DATABASE_URL;
    const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));

    const req = (method, p, body, cookie) => new Promise((resolve) => {
      const data = body ? JSON.stringify(body) : null;
      const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
        headers: Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': Buffer.byteLength(data) } : {}, cookie ? { cookie } : {}) },
        (res) => { let b = ''; res.on('data', d => (b += d)); res.on('end', () => {
          let j = null; try { j = JSON.parse(b); } catch (e) {}
          resolve({ status: res.statusCode, json: j, body: b, headers: res.headers });
        }); });
      r.on('error', () => resolve({ status: 0, json: null, body: '', headers: {} }));
      if (data) r.write(data); r.end();
    });

    let up = false;
    for (let i = 0; i < 60; i++) { try { const h = await req('GET', '/api/health'); if (h.status === 200) { up = true; break; } } catch (e) {} await sleep(200); }
    if (!up) { chk('سرور تست بالا آمد', false, log.slice(0, 300)); }
    else {
      chk('سرور تست بالا آمد', true);
      const PHONE = '09999838444', NID = '9993235245';
      const sc = await req('POST', '/api/auth/send-code', { phone: PHONE });
      const code = sc.json && sc.json.demo_code;
      let cookie = null;
      if (code) {
        const lg = await req('POST', '/api/auth/login', { phone: PHONE, code, national_id: NID });
        if (lg.status === 200) cookie = (lg.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
      }
      if (!cookie) {
        chk('نشست سوپرادمین گرفته شد', false);
      } else {
        chk('نشست سوپرادمین گرفته شد', true);

        /* ساخت کلاس — نسخهٔ اولیه باید ۱ باشد */
        const mk = await req('POST', '/api/v1/classes', { name: 'کلاس او‌سی‌سی', grade: 11, school_id: 1 }, cookie);
        const cls = mk.json && mk.json.data;
        chk('کلاس با نسخهٔ ۱ ساخته می‌شود', !!(cls && cls.version === 1), mk.body.slice(0, 150));

        if (cls) {
          /* نوشت درست با پایهٔ ۱ */
          const u1 = await req('PATCH', '/api/v1/classes/' + cls.id, { name: 'ویرایش یکم', base_version: 1 }, cookie);
          chk('نوشت با پایهٔ درست ۲۰۰ است', u1.status === 200 && u1.json && u1.json.data && u1.json.data.version === 2,
            u1.status + ' ' + u1.body.slice(0, 150));
          /* نوشت کهنه با پایهٔ ۱ */
          const u2 = await req('PATCH', '/api/v1/classes/' + cls.id, { name: 'ویرایش کهنه', base_version: 1 }, cookie);
          chk('نوشت کهنه ۴۰۹ می‌گیرد', u2.status === 409 && u2.json && u2.json.code === 'conflict', u2.status + ' ' + u2.body.slice(0, 150));
          chk('نسخهٔ سرور در ۴۰۹ هست', u2.json && u2.json.server_version === 2);
          /* نوشت با پایهٔ تازه */
          const u3 = await req('PATCH', '/api/v1/classes/' + cls.id, { name: 'ویرایش دوم', base_version: 2 }, cookie);
          chk('نوشت با پایهٔ تازه می‌گذرد', u3.status === 200 && u3.json.data.version === 3, u3.status + ' ' + u3.body.slice(0, 150));
          /* کلاینت کهنه: بدون نسخه */
          const u4 = await req('PATCH', '/api/v1/classes/' + cls.id, { name: 'بدون نسخه' }, cookie);
          chk('کلاینت بدون نسخه می‌گذرد و بامپ می‌شود', u4.status === 200 && u4.json.data.version === 4, u4.status + ' ' + u4.body.slice(0, 150));
          /* دو نوشت همزمان با پایهٔ یکسان → یکی برنده */
          const base = u4.json.data.version;
          const [a, b] = await Promise.all([
            req('PATCH', '/api/v1/classes/' + cls.id, { name: 'همزمان الف', base_version: base }, cookie),
            req('PATCH', '/api/v1/classes/' + cls.id, { name: 'همزمان ب', base_version: base }, cookie)
          ]);
          const codes = [a.status, b.status].sort();
          chk('دو نوشت همزمان → یکی ۲۰۰ و یکی ۴۰۹', codes[0] === 200 && codes[1] === 409,
            `a=${a.status} b=${b.status}`);
        }

        /* حضور و غیاب: نسخهٔ کهنه باید ۴۰۹ شود (پیش‌تر بی‌بررسی بامپ می‌شد) */
        const att = await req('POST', '/api/v1/attendance',
          { student_id: 3, class_id: 1, date: '2026-09-08', status: 'present', school_id: 1 }, cookie);
        const rec = att.json && att.json.data;
        if (att.status === 201 && rec) {
          chk('رکورد حضور با نسخهٔ ۱ ساخته می‌شود', rec.version === 1, 'v=' + rec.version);
          const p1 = await req('PATCH', '/api/v1/attendance/' + rec.id, { status: 'absent', base_version: 1 }, cookie);
          chk('ویرایش حضور با پایهٔ درست می‌گذرد', p1.status === 200 && p1.json.data.version === 2, p1.status + ' ' + p1.body.slice(0, 120));
          const p2 = await req('PATCH', '/api/v1/attendance/' + rec.id, { status: 'present', base_version: 1 }, cookie);
          chk('ویرایش کهنهٔ حضور ۴۰۹ می‌گیرد', p2.status === 409, 'got=' + p2.status);
        } else {
          chk('رکورد حضور ساخته شد', false, att.status + ' ' + att.body.slice(0, 150));
        }
      }
    }

    /* F-A7: if the child already died (boot FATAL), waiting on 'exit' would
       never resolve → silent natural exit 0. Only await a live child, so the
       summary + honest exit code below ALWAYS run. */
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(r => child.once('exit', r));
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\nocc (P0-18): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
