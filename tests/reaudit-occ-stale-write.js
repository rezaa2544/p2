#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   RE-AUDIT / A-20 — stale-write واقعی رویِ مسیرهای PATCHِ غیرِ strict
   ───────────────────────────────────────────────────────────────────
   پرسشِ مستقل: آیا قراردادِ «کلاینتِ کهنه» (occ.js:8-10) واقعاً یک
   stale-write را ممکن می‌کند، یا فقط یک سازگاریِ بی‌ضرر است؟

   این تست، خودش پاسخ را رویِ یک سرورِ واقعی (HTTP زنده) می‌سنجد:

     فاز ۱ (قرارداد وقتی نسخه فرستاده می‌شود):
       - PATCH با base_version درست   ⇒ ۲۰۰ و bump
       - PATCH با base_version کهنه   ⇒ ۴۰۹ conflict
     فاز ۲ (stale-write واقعی):
       - نویسندهٔ A ویرایش می‌کند (base_version درست) ⇒ ۲۰۰
       - نویسندهٔ B نسخه نمی‌فرستد و محتوای کهنه می‌نویسد ⇒ ۲۰۰ + از بین
         رفتنِ ویرایشِ A، بدونِ هیچ سیگنالِ تعارض. ← STALE WRITE
     فاز ۳ (عدمِ یکنواختیِ strict):
       - با PAYESH_STRICT_BASE_VERSION=1: grades بدونِ نسخه ⇒ ۴۰۰،
         ولی چهار مسیرِ دیگر بدونِ نسخه ⇒ همچنان ۲۰۰. یعنی پرچمِ
         «سازگاری» فقط رویِ یک مسیر اعمال نمی‌شود، نه همه.

   اجرا:  node tests/reaudit-occ-stale-write.js
   ═════════════════════════════════════════════════════════════════ */
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

/* پیکربندیِ هر موجودیت: مسیر، فیلدِ نشانار، مقدارها */
const ENTITIES = [
  { key: 'students',  path: '/api/v1/students',  field: 'full_name', a: 'A_برنده', b: 'B_دزدیده' },
  { key: 'users',     path: '/api/v1/users',     field: 'full_name', a: 'A_برنده', b: 'B_دزدیده' },
  { key: 'classes',   path: '/api/v1/classes',   field: 'name',      a: 'A_برنده', b: 'B_دزدیده' },
  { key: 'attendance',path: '/api/v1/attendance',field: 'note',      a: 'A_برنده', b: 'B_دزدیده' },
  { key: 'grades',    path: '/api/v1/grades',    field: 'score',     a: 18.5,      b: 2.5 }
];

function bootServer(port, extraEnv) {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a20-'));
    const tmpStore = path.join(tmpDir, 's.json');
    const srcStore = path.join(ROOT, 'server', 'data', 'payesh.json');
    if (!fs.existsSync(srcStore)) {
      const { execSync } = require('child_process');
      execSync('node server/seed.js', { cwd: ROOT, stdio: 'ignore' });
    }
    fs.copyFileSync(srcStore, tmpStore);
    const env = Object.assign({}, process.env, {
      PORT: String(port), HOST: '127.0.0.1',
      PAYESH_STORE: tmpStore,
      PAYESH_AUDIT: path.join(tmpDir, 'a.log'),
      PAYESH_KEY: path.join(tmpDir, 'k.key'),
      PAYESH_DEMO_CODE: '1'
    }, extraEnv || {});
    delete env.NODE_ENV; delete env.REDIS_URL;
    const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));
    resolve({ child, log, tmpDir });
  });
}

function makeReq(port) {
  return (method, p, body, cookie) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': Buffer.byteLength(data) } : {}, cookie ? { cookie } : {}) },
      (res) => { let b = ''; res.on('data', d => (b += d)); res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, body: b, headers: res.headers });
      }); });
    r.on('error', () => resolve({ status: 0, json: null, body: '', headers: {} }));
    if (data) r.write(data); r.end();
  });
}

async function waitFor(port, req) {
  for (let i = 0; i < 90; i++) {
    try { const h = await req('GET', '/api/health'); if (h.status === 200) return true; } catch (e) {}
    await sleep(200);
  }
  return false;
}

async function login(req) {
  const PHONE = '09999838444', NID = '9993235245';
  const sc = await req('POST', '/api/auth/send-code', { phone: PHONE });
  const code = sc.json && sc.json.demo_code;
  if (!code) return null;
  const lg = await req('POST', '/api/auth/login', { phone: PHONE, code, national_id: NID });
  if (lg.status !== 200) return null;
  return (lg.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

/* اولین رکوردِ قابلِ خواندنِ هر مجموعه را برمی‌گرداند */
async function firstRecord(req, ent, cookie) {
  const g = await req('GET', ent.path + '?limit=5', null, cookie);
  const list = g.json && (g.json.data || g.json);
  if (!Array.isArray(list) || !list.length) return null;
  return list[0];
}

/* اولین رکوردِ قابلِ خواندنِ هر مجموعه را برمی‌گرداند */
async function firstRecord(req, ent, cookie) {
  const g = await req('GET', ent.path + '?limit=5', null, cookie);
  const list = g.json && (g.json.data || g.json);
  if (!Array.isArray(list) || !list.length) return null;
  return list[0];
}

/* مقدارِ ذخیره‌شده را از طریقِ لیست می‌خوانیم (attendance/grades مسیرِ
   GET-by-id ندارند، ولی همگی لیست دارند). */
async function readBack(req, ent, id, cookie) {
  const g = await req('GET', ent.path + '?limit=200', null, cookie);
  const list = g.json && (g.json.data || g.json);
  if (!Array.isArray(list)) return null;
  return list.find((x) => Number(x.id) === Number(id)) || null;
}

async function runPhase(port, req, cookie, strictMode) {
  const label = strictMode ? 'STRICT' : 'عادی';
  for (const ent of ENTITIES) {
    const rec = await firstRecord(req, ent, cookie);
    if (!rec) { chk(`[${ent.key}] رکوردِ نمونه یافت شد (${label})`, false, 'لیست خالی'); continue; }
    const id = rec.id;
    const v0 = Number(rec.version) || 1;

    if (!strictMode) {
      /* فاز ۱: قراردادِ OCC وقتی base_version فرستاده می‌شود */
      const w1 = await req('PATCH', ent.path + '/' + id, { [ent.field]: ent.a, base_version: v0 }, cookie);
      chk(`[${ent.key}/${label}] پایهٔ درست ⇒ ۲۰۰ و نسخه ${v0 + 1}`,
        w1.status === 200 && w1.json && w1.json.data && Number(w1.json.data.version) === v0 + 1,
        w1.status + ' ' + String(w1.body).slice(0, 120));

      const stale = await req('PATCH', ent.path + '/' + id, { [ent.field]: 'نباید_پیاده_شود', base_version: v0 }, cookie);
      chk(`[${ent.key}/${label}] پایهٔ کهنه ⇒ ۴۰۹ conflict`,
        stale.status === 409 && stale.json && stale.json.code === 'conflict',
        stale.status + ' ' + String(stale.body).slice(0, 120));

      /* فاز ۲: stale-write واقعی — B بدونِ نسخه، ویرایشِ A را له می‌کند */
      const a2 = await req('PATCH', ent.path + '/' + id, { [ent.field]: ent.a, base_version: v0 + 1 }, cookie);
      chk(`[${ent.key}/${label}] نویسندهٔ A ویرایش می‌کند (پایهٔ تازه)`,
        a2.status === 200, a2.status + ' ' + String(a2.body).slice(0, 120));

      const bNoVer = await req('PATCH', ent.path + '/' + id, { [ent.field]: ent.b }, cookie);
      const after = await readBack(req, ent, id, cookie);
      const stored = after ? after[ent.field] : undefined;
      const verAfter = after ? Number(after.version) : -1;
      chk(`[${ent.key}/${label}] B بدونِ base_version ⇒ ۲۰۰ (ناامن)`,
        bNoVer.status === 200, bNoVer.status + ' ' + String(bNoVer.body).slice(0, 120));
      chk(`[${ent.key}/${label}] stale-write واقعی: ویرایشِ A از بین رفت`,
        bNoVer.status === 200 && stored === ent.b && verAfter >= v0 + 2,
        `stored=${JSON.stringify(stored)} v=${verAfter} (منتظره ${JSON.stringify(ent.b)} و ≥ ${v0 + 2})`);
    } else {
      /* فاز ۳: حالتِ strict — پس از fixِ A-20 همهٔ مسیرها یکنواخت اعمال
         می‌شوند (pre-fix: فقط grades رد می‌کرد و چهار مسیر ۲۰۰ می‌دادند). */
      const noVer = await req('PATCH', ent.path + '/' + id, { [ent.field]: ent.b }, cookie);
      chk(`[${ent.key}/${label}] بدونِ base_version ⇒ ۴۰۰ missing_base_version`,
        noVer.status === 400 && noVer.json && noVer.json.code === 'missing_base_version',
        noVer.status + ' ' + String(noVer.body).slice(0, 120));
    }
  }
}

async function main() {
  console.log('▸ RE-AUDIT A-20 — stale-write واقعی OCC');

  /* بوتِ عادی */
  {
    const PORT = 8971;
    const { child, log, tmpDir } = await bootServer(PORT);
    const req = makeReq(PORT);
    const up = await waitFor(PORT, req);
    if (!up) { chk('سرورِ عادی بالا آمد', false, log.slice(0, 300)); }
    else {
      chk('سرورِ عادی بالا آمد', true);
      const cookie = await login(req);
      if (!cookie) { chk('نشست سوپرادمین', false); }
      else {
        chk('نشست سوپرادمین', true);
        await runPhase(PORT, req, cookie, false);
      }
    }
    child.kill('SIGTERM');
    await new Promise(r => child.on('exit', r));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  /* بوتِ strict */
  {
    const PORT = 8972;
    const { child, log, tmpDir } = await bootServer(PORT, { PAYESH_STRICT_BASE_VERSION: '1' });
    const req = makeReq(PORT);
    const up = await waitFor(PORT, req);
    if (!up) { chk('سرورِ strict بالا آمد', false, log.slice(0, 300)); }
    else {
      chk('سرورِ strict بالا آمد', true);
      const cookie = await login(req);
      if (!cookie) { chk('نشست سوپرادمین (strict)', false); }
      else {
        chk('نشست سوپرادمین (strict)', true);
        await runPhase(PORT, req, cookie, true);
      }
    }
    child.kill('SIGTERM');
    await new Promise(r => child.on('exit', r));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\nreaudit-occ-stale-write (A-20): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
