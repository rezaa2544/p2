#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/performance/baseline.js — سنجهٔ خط پایهٔ عملکرد (Wave 24)
   -------------------------------------------------------------------
   چهار KPI بریف Wave 24 را می‌سنجد و چاپ می‌کند؛ با پرچم --assert
   آستانه‌های هدف را هم گیت می‌کند (برای اجرا پس از بهینه‌سازی).

     ۱. اندازهٔ index.html            هدف < 1.8MB (1,887,437B)
     ۲. زمان node build.js            هدف < 70ms (میانهٔ ۵ اجرا)
     ۳. parse کامل store JSON         هدف < 50ms (میانهٔ ۵ اجرا)
     ۴. p95 تأخیر API (درون‌پردازه)   هدف < 150ms
        (GET /api/v1/bootstrap + گزارش attendance — سنگین‌ترین مسیرها)

   بدون وابستگی خارجی؛ اندازه‌گیری زمان با hrtime (نبود /usr/bin/time
   در سندباکس مستند است). اجرای بدون --assert فقط گزارش می‌دهد و
   همیشه exit 0 — برای ثبت baseline قبل از تغییرات.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const ASSERT = process.argv.includes('--assert');

const TARGETS = {
  indexBytes: 1.8 * 1024 * 1024,   /* < 1.8MB */
  buildMs: 70,                     /* < 70ms */
  parseMs: 50,                     /* < 50ms */
  apiP95Ms: 150,                   /* < 150ms */
};

const results = [];
function record(name, value, target, unit){
  const pass = value < target;
  results.push({ name, value, target, unit, pass });
  const mark = pass ? '✅' : (ASSERT ? '❌' : '⚠️ ');
  console.log(`${mark} ${name}: ${typeof value === 'number' ? value.toFixed(1) : value}${unit} (هدف < ${target}${unit})`);
}

function median(arr){
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function pctl(arr, p){
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

/* ── ۱) اندازهٔ index.html ─────────────────────────────────────── */
function measureIndexSize(){
  const bytes = fs.statSync(path.join(ROOT, 'index.html')).size;
  record('index.html size', bytes / 1024, TARGETS.indexBytes / 1024, 'KB');
  return bytes;
}

/* ── ۲) زمان build (میانهٔ ۵ اجرا، فرایند جدا مثل استفادهٔ واقعی) ── */
function measureBuild(){
  const times = [];
  for (let i = 0; i < 5; i++){
    const t0 = process.hrtime.bigint();
    execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'pipe' });
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  record('build.js (median of 5)', median(times), TARGETS.buildMs, 'ms');
}

/* ── ۳) parse استور (read+decode+parse — همان مسیر loadStore سرور) ─ */
function measureParse(){
  const storeFile = path.join(ROOT, 'server', 'data', 'payesh.json');
  const times = [];
  for (let i = 0; i < 5; i++){
    const t0 = process.hrtime.bigint();
    JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  record('store JSON parse (median of 5)', median(times), TARGETS.parseMs, 'ms');
}

/* ── ۴) p95 تأخیر API — سرور درون‌پردازه، بدون شبکهٔ واقعی ───────── */
async function measureApi(){
  /* استور را به tmp کپی می‌کنیم تا اجرای تست دادهٔ اصلی را نیالاید */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-base-'));
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), path.join(tmp, 'payesh.json'));
  process.env.PAYESH_STORE = path.join(tmp, 'payesh.json');
  process.env.PAYESH_AUDIT = path.join(tmp, 'audit.log');
  process.env.PAYESH_KEY = path.join(tmp, 'key');
  process.env.PAYESH_DEMO_CODE = '1';

  const mod = require(path.join(ROOT, 'server', 'index.js'));
  const server = mod.server || mod;
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const request = (method, p, body, cookie) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port, method, path: p,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });

  /* ورود مدیر مدرسه (روال OTP دمو: send-code → demo_code → login) */
  const store0 = JSON.parse(fs.readFileSync(process.env.PAYESH_STORE, 'utf8'));
  const mgr = store0.users.find((u) => u.role === 'manager' && u.active);
  const sc = await request('POST', '/api/auth/send-code', { phone: mgr.phone });
  const code = JSON.parse(sc.body).demo_code || '000000';
  const lg = await request('POST', '/api/auth/login', { phone: mgr.phone, code, national_id: mgr.national_id });
  if (lg.status !== 200) throw new Error('login failed: ' + lg.status + ' ' + lg.body);
  const cookie = (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

  /* گرم‌کردن + سنجش: bootstrap (سنگین‌ترین GET) و یک گزارش */
  const paths = ['/api/v1/bootstrap', '/api/v1/reports/attendance?jy=1405&jm=6'];
  for (const p of paths) await request('GET', p, null, cookie); /* warmup */
  const lat = [];
  for (let i = 0; i < 40; i++){
    for (const p of paths){
      const t0 = process.hrtime.bigint();
      const r = await request('GET', p, null, cookie);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (r.status !== 200) throw new Error(`GET ${p} → ${r.status}`);
      lat.push(ms);
    }
  }
  record(`API p95 (${lat.length} reqs, bootstrap+report)`, pctl(lat, 95), TARGETS.apiP95Ms, 'ms');
  console.log(`   p50=${pctl(lat, 50).toFixed(1)}ms p99=${pctl(lat, 99).toFixed(1)}ms max=${Math.max(...lat).toFixed(1)}ms`);

  await new Promise((res) => server.close(res));
}

(async () => {
  console.log('── Wave 24 KPI baseline ──');
  measureIndexSize();
  measureBuild();
  measureParse();
  await measureApi();
  const failed = results.filter((r) => !r.pass);
  if (ASSERT && failed.length){
    console.error(`\n❌ ${failed.length}/${results.length} KPI زیر هدف نیست.`);
    process.exit(1);
  }
  console.log(`\nجمع: ${results.filter((r) => r.pass).length}/${results.length} KPI در محدودهٔ هدف${ASSERT ? ' (حالت گیت)' : ' (حالت گزارش)'}.`);
  process.exit(0);
})().catch((e) => { console.error('baseline error:', e); process.exit(1); });
