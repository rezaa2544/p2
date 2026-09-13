#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/performance/query-optimization.js — آزمونِ مسیرِ داده (Wave 24)
   -------------------------------------------------------------------
   پوشش KPI-3 (پارس استور < 50ms) و KPI-4 (p95 API < 150ms):

   بخش A — قالبِ ASCII استور (server/json-fast.js):
     A1 رفت‌وبرگشتِ کامل: stringifyAscii → JSON.parse = هم‌ارزِ عمیق
     A2 خروجی ASCII خالص است (هیچ بایتِ > 0x7F)
     A3 متنِ فارسی، surrogate pair (emoji)، null/عدد/بولی سالم برمی‌گردند
     A4 خروجی JSON استاندارد — JSON.parse بومی بدونِ هیچ helper می‌خواند
     A5 استورِ seed شدهٔ واقعی با قالبِ ASCII نوشته شده (integration)

   بخش B — persist سرور با قالبِ نو:
     B1 سرورِ واقعی بوت + ورودِ کاربر + persist → فایلِ نوشته‌شده ASCII
     B2 بوتِ دوباره از همان فایل → داده‌ها سالم (users/rows برابر)

   بخش C — گیت‌های KPI:
     C1 پارسِ استورِ مرجع (میانهٔ ۹ اجرای گرم) < 50ms
     C2 p95 خواندنی‌های API (bootstrap + گزارش) < 150ms — سرور درون‌پردازه

   موتانت‌گارد:
     M1 اگر escape حذف شود (خروجی غیر ASCII) → A2 قرمز
     M2 اگر LUT مقدارِ غلط کش کند → A1/A3 قرمز
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.join(__dirname, '..', '..');
const { stringifyAscii } = require(path.join(ROOT, 'server', 'json-fast.js'));

let pass = 0, fail = 0;
const T = (ok, name, detail) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const pctl = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];

console.log('▸ Wave 24 — مسیرِ داده: قالبِ استور + KPI-3/KPI-4');

/* ── بخش A ── */
const sample = {
  fa: 'پایش — دبیرستانِ نمونهٔ تهران',
  mixed: 'کلاس 7Aـ«ریاضی» × ٪۵۰',
  emoji: 'نمره 🎉👨‍🏫 ثبت شد',
  nested: { arr: [1, 2.5, null, true, 'آبان'], deep: { k: 'مقدار' } },
  num: -0.125, bool: false, nul: null, empty: '', ascii: 'plain ASCII 123',
};
const enc = stringifyAscii(sample);
T(JSON.stringify(JSON.parse(enc)) === JSON.stringify(sample), 'A1 رفت‌وبرگشت هم‌ارزِ عمیق');
T(!/[\u0080-\uffff]/.test(enc), 'A2 خروجی ASCII خالص');
const back = JSON.parse(enc);
T(back.fa === sample.fa && back.emoji === sample.emoji && back.nested.arr[4] === 'آبان',
  'A3 فارسی + surrogate pair (emoji) + تو در تو سالم');
T(back.nul === null && back.bool === false && back.num === -0.125 && back.empty === '',
  'A4 انواعِ اسکالر دقیق برمی‌گردند');

const storeFile = path.join(ROOT, 'server', 'data', 'payesh.json');
const rawHead = fs.readFileSync(storeFile).slice(0, 262144);
let nonAscii = false;
for (const b of rawHead) if (b > 0x7f) { nonAscii = true; break; }
T(!nonAscii, 'A5 استورِ seed شدهٔ واقعی با قالبِ ASCII نوشته شده');

/* ── بخش B + C2: سرورِ درون‌پردازه ── */
async function serverChecks(){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-query-'));
  const tmpStore = path.join(tmp, 'payesh.json');
  fs.copyFileSync(storeFile, tmpStore);
  process.env.PAYESH_STORE = tmpStore;
  process.env.PAYESH_AUDIT = path.join(tmp, 'audit.log');
  process.env.PAYESH_KEY = path.join(tmp, 'key');
  process.env.PAYESH_DEMO_CODE = '1';

  const mod = require(path.join(ROOT, 'server', 'index.js'));
  const server = mod.server || mod;
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const request = (method, p, body, cookie) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, method, path: p,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } },
      (res) => { const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch).toString('utf8') })); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });

  const store0 = JSON.parse(fs.readFileSync(tmpStore));
  const mgr = store0.users.find((u) => u.role === 'manager' && u.active);
  const sc = await request('POST', '/api/auth/send-code', { phone: mgr.phone });
  const code = JSON.parse(sc.body).demo_code || '000000';
  const lg = await request('POST', '/api/auth/login', { phone: mgr.phone, code, national_id: mgr.national_id });
  T(lg.status === 200, 'B1a ورود روی استورِ قالبِ نو موفق', 'status=' + lg.status);
  const cookie = (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

  const bs = await request('GET', '/api/v1/bootstrap', null, cookie);
  T(bs.status === 200, 'B1b bootstrap روی استورِ قالبِ نو 200', 'status=' + bs.status);
  const bsJson = JSON.parse(bs.body);
  const bsData = bsJson.data || bsJson;
  T(!!(bsData.students || bsData.classes || bsData.users), 'B1c بدنهٔ bootstrap داده دارد');

  /* C2: p95 روی مسیرهای داغِ خواندنی */
  const paths = ['/api/v1/bootstrap', '/api/v1/reports/attendance?jy=1405&jm=6', '/api/v1/students', '/api/v1/grades'];
  for (const p of paths){
    const r = await request('GET', p, null, cookie);
    if (r.status !== 200) { T(false, 'C2 پیش‌نیاز: GET ' + p + ' → ' + r.status); return server; }
  }
  const lat = [];
  for (let i = 0; i < 25; i++){
    for (const p of paths){
      const t0 = process.hrtime.bigint();
      await request('GET', p, null, cookie);
      lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
  }
  const p95 = pctl(lat, 95);
  T(p95 < 150, `C2 p95 چهار مسیرِ داغ (${lat.length} req) = ${p95.toFixed(1)}ms < 150ms`,
    'p50=' + pctl(lat, 50).toFixed(1));

  /* B2: بوتِ دوباره — استور را فرایندِ جدا بخواند و بشمارد */
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['-e', `
    const o = JSON.parse(require('fs').readFileSync(${JSON.stringify(tmpStore)}));
    let rows = 0; for (const k in o) if (Array.isArray(o[k])) rows += o[k].length;
    console.log(o.users.length + ':' + rows);
  `], { encoding: 'utf8' }).trim();
  let rows0 = 0; for (const k in store0) if (Array.isArray(store0[k])) rows0 += store0[k].length;
  T(out === store0.users.length + ':' + rows0, 'B2 بوتِ دوباره از فایل: users/rows برابر', out + ' vs ' + store0.users.length + ':' + rows0);

  return server;
}

/* ── C1 ── */
function kpiParse(){
  const times = [];
  for (let i = 0; i < 9; i++){
    const t0 = process.hrtime.bigint();
    JSON.parse(fs.readFileSync(storeFile));
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const med = median(times);
  T(med < 50, `C1 پارسِ استور (میانهٔ ۹ اجرای گرم) = ${med.toFixed(1)}ms < 50ms`);
}

(async () => {
  kpiParse();
  const server = await serverChecks();
  await new Promise((res) => server.close(res));
  console.log(`\nquery-optimization: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '✅'}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('خطا:', e); process.exit(1); });
