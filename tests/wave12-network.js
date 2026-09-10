#!/usr/bin/env node
/* tests/wave12-network.js — ویو ۱۲: لایهٔ شبکه/لبه (Network / Edge).
   گروه‌ها:
   - HDR: سرآیندهایِ امنیتیِ زنده (شاملِ HSTS پشتِ PAYESH_HTTPS و ننسِ یکتا)
   - EDGE: رگکس‌هایِ بلاکِ لبه (استخراج از خودِ nginx.conf) — مثبت/منفی
   - CIN: حضورِ SAST/SCA در گردشِ کارِ امنیتیِ گیت‌هاب
   - DOC: اسنادِ الزامیِ لبه/CDN و بندهایِ حیاتی‌شان
   اجرا: node tests/wave12-network.js
   نکته: این تست «قرارداد» است — هر تغییری در قانون‌هایِ لبه، سرآیندها یا
   گردشِ کارِ امنیتی باید از این‌جا عبور کند (همراه: موجّه در
   tests/wave12-network-mutations.js). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const NGINX_CONF = path.join(ROOT, 'nginx', 'nginx.conf');
const SERVER = path.join(ROOT, 'server', 'index.js');
const SECURITY_YML = path.join(ROOT, '.github', 'workflows', 'security.yml');
const PENDING_PATCH = path.join(ROOT, 'ci', 'pending', 'security-sast-sca.patch');
const CDN_DOC = path.join(ROOT, 'docs', 'CDN_INTEGRATION_SETUP.md');
const WAF_DOC = path.join(ROOT, 'docs', 'WAF_DDOS_SETUP.md');
const SEED_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n▸ ' + t); }
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra ? '\n     ' + String(extra).slice(0, 300) : '')); }
}

async function pickPort(base) {
  for (let p = base; p < base + 30; p++) {
    const free = await new Promise((res) => {
      const s = require('net').createServer();
      s.once('error', () => res(false));
      s.once('listening', () => { s.close(() => res(true)); });
      s.listen(p, '127.0.0.1');
    });
    if (free) return p;
  }
  throw new Error('پورتِ آزاد نیست');
}
function apiRequest(port, method, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: headers || {} }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}
async function bootServer(envExtra, tmp) {
  const port = await pickPort(19011);
  const storeP = path.join(tmp, 's' + port + '.json');
  fs.copyFileSync(SEED_STORE, storeP);
  const child = cp.spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port), PAYESH_STORE: storeP,
      PAYESH_AUDIT: path.join(tmp, 'a' + port + '.log'),
      PAYESH_KEY: path.join(tmp, 'k' + port + '.key'),
      TRACING_ENABLED: 'false'
    }, envExtra || {}),
    stdio: ['ignore', 'ignore', 'ignore']
  });
  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try { const r = await apiRequest(port, 'GET', '/api/health', {}); if (r.status === 200) { ok = true; break; } } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return { port, child, ok };
}

/* ── HDR: سرآیندهایِ امنیتیِ زنده ─────────────────────────────── */
async function hdrGroup() {
  grp('HDR — سرآیندهایِ امنیتی (زنده)');
  if (!fs.existsSync(SEED_STORE)) { chk('HDR-0 سید هست', false, 'node server/seed.js'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w12-'));
  /* حالتِ پشتِ پروکسیِ TLS: PAYESH_HTTPS=1 → HSTS باید بیاید */
  const a = await bootServer({ PAYESH_HTTPS: '1' }, tmp);
  chk('HDR-0 بوت با PAYESH_HTTPS=1', a.ok);
  if (a.ok) {
    try {
      const h1 = await apiRequest(a.port, 'GET', '/api/health', {});
      const H = h1.headers;
      chk('HDR-1 شش سرآیندِ امنیتی حاضر است',
        !!H['content-security-policy'] && H['x-frame-options'] === 'DENY' &&
        H['x-content-type-options'] === 'nosniff' && H['referrer-policy'] === 'same-origin' &&
        !!H['permissions-policy'] && !!H['strict-transport-security'],
        JSON.stringify(Object.keys(H)));
      chk('HDR-2 مقدارِ HSTS یک سال + زیردامنه',
        (H['strict-transport-security'] || '') === 'max-age=31536000; includeSubDomains', H['strict-transport-security']);
      chk('HDR-3 CSP سخت‌گیرانه (بدونِ unsafe-inline)',
        /default-src 'self'/.test(H['content-security-policy'] || '') &&
        /frame-ancestors 'none'/.test(H['content-security-policy'] || '') &&
        (H['content-security-policy'] || '').indexOf('unsafe-inline') < 0);
      const n1 = (H['content-security-policy'] || '').match(/'nonce-([^']+)'/);
      const h2 = await apiRequest(a.port, 'GET', '/api/health', {});
      const n2 = ((h2.headers['content-security-policy'] || '').match(/'nonce-([^']+)'/) || [])[1];
      chk('HDR-4 ننسِ یک‌بارمصرف (دو پاسخ، دو ننسِ متفاوت)', !!(n1 && n1[1]) && !!n2 && n1[1] !== n2,
        (n1 && n1[1]) + ' vs ' + n2);
    } finally { try { a.child.kill('SIGKILL'); } catch (e) {} }
  } else { try { a.child.kill('SIGKILL'); } catch (e) {} }
  /* حالتِ بدونِ اعلامِ پروکسی: نباید بی‌جهت HSTS بدهد (fail-closed) */
  const b = await bootServer({}, tmp);
  chk('HDR-5 بوتِ ساده', b.ok);
  if (b.ok) {
    try {
      const h = await apiRequest(b.port, 'GET', '/api/health', {});
      chk('HDR-6 بدونِ اعلامِ پروکسی، خبری از HSTS نیست', !h.headers['strict-transport-security'],
        h.headers['strict-transport-security']);
      chk('HDR-6b بقیهٔ سرآیندها سرِ جایِ خود',
        !!h.headers['content-security-policy'] && h.headers['x-content-type-options'] === 'nosniff');
    } finally { try { b.child.kill('SIGKILL'); } catch (e) {} }
  } else { try { b.child.kill('SIGKILL'); } catch (e) {} }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

/* ── EDGE: رگکس‌هایِ بلاکِ لبه، استخراج از خودِ پرونده ─────────── */
function edgeRegexes() {
  const c = fs.readFileSync(NGINX_CONF, 'utf8');
  const m = c.match(/wave12-edge-rules:start([\s\S]*?)wave12-edge-rules:end/);
  if (!m) return null;
  const out = [];
  m[1].split('\n').forEach((line) => {
    const t = line.trim();
    if (t.indexOf('~*') !== 0) return;
    const re = t.slice(2).replace(/\s+1;$/, '');
    try { out.push(new RegExp(re, 'i')); } catch (e) { out.push({ bad: re, err: e.message }); }
  });
  return out;
}
function edgeGroup() {
  grp('EDGE — قوانینِ بلاکِ لبه (از خودِ nginx.conf)');
  let rx = null;
  try { rx = edgeRegexes(); } catch (e) {}
  chk('EDGE-0 نشانگرها و رگکس‌ها استخراج شدند', !!rx && rx.length >= 10, rx ? ('n=' + rx.length) : 'نشانگر نیست');
  if (!rx) return;
  const bad = rx.filter((r) => r && r.bad);
  chk('EDGE-1 همهٔ رگکس‌ها معتبرند', bad.length === 0, bad.map((b) => b.bad + ':' + b.err).join(' / '));
  const any = (u) => rx.some((r) => r && !r.bad && r.test(u));
  /* مثبت: بارهایِ حملهٔ واقع‌گرایانه به‌شکلِ نشانیِ خام */
  const tp = [
    ['/api/x?id=1%20UNION%20SELECT%20password%20FROM%20users', 'sqli'],
    ['/api/x?id=1%20OR%201=1', 'sqli'],
    ['/api/x?n=%27%20OR%20%271%27=%271', 'sqli'],
    ['/api/x?a=1;%20DROP%20TABLE%20users', 'sqli'],
    ['/api/x?a=SLEEP(5)', 'sqli'],
    ['/api/x?a=information_schema.tables', 'sqli'],
    ['/api/x?q=%3Cscript%3Ealert(1)%3C/script%3E', 'xss'],
    ['/api/x?q=<script>alert(1)</script>', 'xss'],
    ['/api/x?q=%3Csvg%20onload=alert(1)%3E', 'xss'],
    ['/api/x?redirect=javascript:alert(1)', 'xss'],
    ['/api/x?redirect=javascript%3Aalert(1)', 'xss'],
    ['/api/x?onerror=alert(1)', 'xss']
  ];
  const fn = tp.filter(([u]) => !any(u));
  chk('EDGE-2 هر ۱۲ حمله در لبه گرفته می‌شود', fn.length === 0, fn.map((f) => f[0]).join(' / '));
  /* منفی: ترافیکِ سالمِ برنامه نباید ۴۰۳ لبه بگیرد */
  const fp = [
    '/api/health', '/api/sync/conflicts', '/api/students/123?name=علی&cls=5',
    '/api/x?a=1&b=2&coupon=SAVE10', '/api/x?button=1&money=on',
    '/api/search?q=1%2B1%3D2', '/', '/index.html', '/USER_GUIDE.html',
    '/api/auth/send-code', '/api/sync', '/api/public-report',
    '/api/v1/attendance?school_id=1&date=2026-09-09',
    '/api/sync/conflicts?class=5', '/api/bell/now', '/privacy.html'
  ];
  const fpHit = fp.filter((u) => any(u));
  chk('EDGE-3 ترافیکِ سالمِ برنامه عبور می‌کند (۰ مثبتِ کاذب)', fpHit.length === 0, fpHit.join(' / '));
}

/* ── CIN: گردشِ کارِ امنیتیِ گیت‌هاب ─────────────────────────── */
/* نکته: گام‌هایِ SAST/SCA با توکنِ فعلی (بدونِ اسکوپِ workflow) قابلِ پوش
   نیستند؛ قرارداد: یا در security.yml حاضرند یا پچِ آمادهٔ آن‌ها در
   ci/pending/security-sast-sca.patch. پس از اِعمالِ پچ، پروندهٔ پچ حذف
   می‌شود و این شرط همچنان سبز می‌ماند. */
function cinGroup() {
  grp('CIN — گردشِ کارِ امنیتی (security.yml + پچِ در انتظار)');
  let y = '', patch = '';
  try { y = fs.readFileSync(SECURITY_YML, 'utf8'); } catch (e) {}
  try { patch = fs.readFileSync(PENDING_PATCH, 'utf8'); } catch (e) {}
  const any = (t) => (typeof t === 'string') ? (y.indexOf(t) >= 0 || patch.indexOf(t) >= 0) : (t.test(y) || t.test(patch));
  chk('CIN-0 پروندهٔ گردشِ کار هست', y.length > 200);
  if (!y) return;
  chk('CIN-1 SAST: CodeQL init + analyze (اعمال‌شده یا پچِ آماده)',
    any('github/codeql-action/init@v3') && any('github/codeql-action/analyze@v3'));
  chk('CIN-2 SCA: ممیزیِ وابستگی‌ها (اعمال‌شده یا پچِ آماده)',
    any(/npm audit .*--audit-level=high/));
  chk('CIN-3 اعتبارسنجیِ نحویِ نگینکس در CI', /nginx -t -c \$PWD\/nginx\/nginx\.conf/.test(y));
  chk('CIN-4 نشت‌یابِ راز در CI', y.indexOf('node tests/secret-scan.js') >= 0);
  chk('CIN-5 تستِ واحدِ WAF در CI', y.indexOf('node tests/waf-ddos.js --unit-only') >= 0);
}

/* ── DOC: اسنادِ لبه و CDN ───────────────────────────────────── */
function docGroup() {
  grp('DOC — اسنادِ شبکه/لبه');
  let cdn = '', waf = '';
  try { cdn = fs.readFileSync(CDN_DOC, 'utf8'); } catch (e) {}
  try { waf = fs.readFileSync(WAF_DOC, 'utf8'); } catch (e) {}
  chk('DOC-0 هر دو سند هست', cdn.length > 1000 && waf.length > 1000, 'cdn=' + cdn.length + ' waf=' + waf.length);
  chk('DOC-1 قیدِ حیاتی: لبه نباید HTML را کش کند (ننسِ یک‌بارمصرف)',
    /هرگز کش نمی‌شود|کش نکن|خاموش/.test(cdn) && cdn.indexOf('ننس') >= 0 && /Bypass cache/.test(cdn));
  chk('DOC-2 حالتِ رمزنگاری و اعلامِ پروکسی', /Full \(strict\)/.test(cdn) && cdn.indexOf('PAYESH_HTTPS=1') >= 0);
  chk('DOC-3 قفلِ اوریجین روی بازهٔ لبه', cdn.indexOf('cloudflare.com/ips') >= 0 || /IPهای لبه/.test(cdn));
  chk('DOC-4 روالِ استقرار', /پاک‌سازی|purge|استقرار/.test(cdn));
  chk('DOC-5 سندِ WAF به قانون‌های ویو۱۲ اشاره دارد', waf.indexOf('wave12-edge-rules') >= 0);
}

/* ── main ────────────────────────────────────────────── */
(async function main() {
  try {
    edgeGroup();
    cinGroup();
    docGroup();
    await hdrGroup();
  } catch (e) {
    fail++;
    failures.push('crash: ' + String((e && e.message) || e));
    console.log('  ❌ کرش: ' + String((e && e.stack) || e).slice(0, 400));
  }
  console.log('\n' + '─'.repeat(52));
  console.log('ویو ۱۲ — شبکه/لبه: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' ناموفق ❌' : ' — بدون خطا ✅'));
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join(' | ').slice(0, 400));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})();
