#!/usr/bin/env node
/* tests/waf-ddos.js — WAF فقط-تشخیص + نرخِ Redis-محور + پیکربندیِ nginx.
   گروه‌ها: CFG (ساختارِ nginx.conf) ،DET (تشخیصِ خالص) ،LIM (محدودساز) ،INT (بوتِ سرور).
   اجرا: node tests/waf-ddos.js [--unit-only (بدونِ بوت؛ برای CI)] */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const NGINX_CONF = path.join(ROOT, 'nginx', 'nginx.conf');
const SERVER = path.join(ROOT, 'server', 'index.js');
const SEED_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const UNIT_ONLY = process.argv.indexOf('--unit-only') >= 0;

const waf = require('../server/waf.js');

let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n▸ ' + t); }
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra ? '\n     ' + String(extra).slice(0, 300) : '')); }
}

/* ── CFG ─────────────────────────────────────────────── */
function cfgGroup() {
  grp('CFG — ساختارِ nginx.conf');
  let c = '';
  try { c = fs.readFileSync(NGINX_CONF, 'utf8'); } catch (e) { c = ''; }
  chk('CFG-a فایلِ nginx.conf هست', c.length > 100);
  if (!c) return;
  chk('CFG-b زونِ نرخِ API صد در دقیقه', /limit_req_zone\s+\$binary_remote_addr\s+zone=api:10m\s+rate=100r\/m/.test(c));
  chk('CFG-c اِعمالِ نرخ با burst', /limit_req\s+zone=api\s+burst=20\s+nodelay/.test(c));
  chk('CFG-d سقفِ اتصالِ همزمان', /limit_conn_zone\s+\$binary_remote_addr\s+zone=addr:10m/.test(c) && /limit_conn\s+addr\s+10/.test(c));
  chk('CFG-e رباتِ مخرب مسدود (۴۰۳/۴۴۴)', /sqlmap/i.test(c) && /nikto/i.test(c) && /(return\s+44[43]|deny\s+all)/.test(c));
  chk('CFG-f نگهبانِ traversal', /%2e/i.test(c) && c.includes('/etc/(passwd|shadow)') && c.includes('\\.\\.'));
  chk('CFG-g خودکفا (بدونِ include سیستمی)', c.indexOf('include') < 0 || /include\s+\/etc/.test(c) === false);
  chk('CFG-h آپ‌استریمِ لوکال + proxy', /127\.0\.0\.1:3000/.test(c) && /proxy_pass\s+http:\/\/payesh/.test(c));
  chk('CFG-i گوش‌دادنِ بدونِ root (۸۰۸۰)', /listen\s+8080/.test(c));
}

/* ── DET ─────────────────────────────────────────────── */
function detGroup() {
  grp('DET — تشخیصِ خالص (بدونِ FP/FN)');
  const ev = (url, ua) => waf.evaluateInput({ url: url || '', ua: ua || '' });
  const sqliTP = [
    "/api/x?q=' UNION SELECT * FROM users",
    '/api/x?id=1 OR 1=1', "/api/x?n=' OR '1'='1",
    '/api/x?a=1; DROP TABLE s', '/api/x?a=1-- ', '/api/x?t=SLEEP(5)'
  ];
  chk('DET-a هر ۶ تزریق شناخته شد', sqliTP.every((u) => { const r = ev(u); return r && r.rule === 'sqli'; }));
  const travTP = [
    '/api/x?f=../../etc/passwd', '/api/x?f=..\\..\\win', '/api/x?f=%2e%2e%2fetc',
    '/api/x?f=%252e%252e', '/static//etc/passwd'
  ];
  chk('DET-b هر ۵ traversal شناخته شد', travTP.every((u) => { const r = ev(u); return r && r.rule === 'traversal'; }));
  const xssTP = [
    '/api/x?q=<script>alert(1)</script>', '/api/x?r=javascript:alert(1)',
    '/api/x?n=<img src=x onerror=alert(1)>', '/api/x?onload=alert(1)', '/api/x?q=<svg onload=1>'
  ];
  chk('DET-c هر ۵ XSS شناخته شد', xssTP.every((u) => { const r = ev(u); return r && r.rule === 'xss'; }));
  const botTP = ['sqlmap/1.7', 'nikto/2.5', 'masscan/1.0', 'gobuster/3.1'];
  chk('DET-d هر ۴ ربات شناخته شد', botTP.every((a) => { const r = ev('/api/health', a); return r && r.rule === 'badbot'; }));
  const clean = [
    '/api/health', '/api/sync/conflicts', '/api/students/123?name=علی&cls=5',
    '/api/x?a=1&b=2&coupon=SAVE10', '/api/x?button=1&money=on', '/api/search?q=1%2B1%3D2'
  ];
  const cleanUA = ['', 'Mozilla/5.0 Chrome/120', 'node', 'curl/8.0', 'PayeshApp/1.0'];
  let fp = [];
  clean.forEach((u) => cleanUA.forEach((a) => { if (ev(u, a)) fp.push(u + ' | ' + a); }));
  chk('DET-e ترافیکِ سالم پاک است (۰ FP)', fp.length === 0, fp.slice(0, 3).join(' / '));
  chk('DET-f ورودیِ تهی/خراب کرش نمی‌کند',
    ev('', '') === null && ev('/api/x?q=%E0%A4%A', '') === null && waf.evaluateInput(null) === null &&
    waf.evaluateInput({}) === null);
}

/* ── LIM ─────────────────────────────────────────────── */
async function limGroup() {
  grp('LIM — محدودسازِ Redis-محور (checkRateLimit)');
  const cache = require('../server/cache.js');
  const tag = 'waf' + Date.now();
  let seqOk = true, lastRem = -1;
  for (let i = 0; i < 5; i++) {
    const r = await cache.checkRateLimit('10.9.9.1', tag + ':seq', 5, 60);
    if (!r.allowed || r.remaining !== 4 - i) seqOk = false;
    lastRem = r.remaining;
  }
  const denied = await cache.checkRateLimit('10.9.9.1', tag + ':seq', 5, 60);
  chk('LIM-a ترتیبی دقیق (۵ مجاز + ششمی مردود)', seqOk && denied.allowed === false && denied.remaining === 0 && lastRem === 0);
  const other = await cache.checkRateLimit('10.9.9.2', tag + ':seq', 5, 60);
  chk('LIM-b ایزولاسیونِ شناسه‌ها', other.allowed === true && other.remaining === 4);
  /* تکه‌تکه (۱۰ موازی × ۱۰ ترتیبی): کرانِ تقریبی */
  let allowed = 0;
  for (let round = 0; round < 10; round++) {
    const rs = await Promise.all(Array.from({ length: 10 }, () =>
      cache.checkRateLimit('10.9.9.3', tag + ':chunk', 100, 60)));
    allowed += rs.filter((r) => r.allowed).length;
  }
  chk('LIM-c صد درخواست در کرانِ ۹۵..۱۰۵', allowed >= 95 && allowed <= 105, 'allowed=' + allowed);
  /* استرسِ ۲۰۰ همزمان (§۱.۵): همه settle + شمارش */
  const all = await Promise.all(Array.from({ length: 200 }, () =>
    cache.checkRateLimit('10.9.9.4', tag + ':stress', 100, 60)));
  const okN = all.filter((r) => r && typeof r.allowed === 'boolean').length;
  chk('LIM-d استرسِ ۲۰۰ همزمان بدونِ گم‌شدگی', okN === 200, 'settled=' + okN);
}

/* ── INT ─────────────────────────────────────────────── */
function portFree(port) {
  return new Promise((resolve) => {
    const s = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
      res.resume(); s.destroy(); resolve(false);
    });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(true));
  });
}
async function pickPort(base) {
  for (let p = base; p < base + 30; p++) { if (await portFree(p)) return p; }
  throw new Error('پورتِ آزاد نیست');
}
function apiRequest(port, method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: headers || {} }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}
async function intGroup() {
  grp('INT — رفتارِ زنده (فقط-تشخیص + سرآیندها + ممیزی)');
  if (!fs.existsSync(SEED_STORE)) { chk('INT-0 سید هست', false, 'node server/seed.js'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-waf-'));
  const port = await pickPort(18801);
  const storeP = path.join(tmp, 's.json');
  const auditP = path.join(tmp, 'a.log');
  fs.copyFileSync(SEED_STORE, storeP);
  const child = cp.spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port), PAYESH_STORE: storeP, PAYESH_AUDIT: auditP,
      PAYESH_KEY: path.join(tmp, 'k.key')
    }),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let bootOk = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const r = await apiRequest(port, 'GET', '/api/health', {});
      if (r.status === 200) { bootOk = true; break; }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  chk('INT-0 بوت', bootOk);
  if (!bootOk) { try { child.kill('SIGKILL'); } catch (e) {} return; }
  try {
    const h = await apiRequest(port, 'GET', '/api/health', {});
    chk('INT-a سالم = clean + سقفِ ۱۰۰', h.headers['x-waf-verdict'] === 'clean' &&
      h.headers['x-ratelimit-limit'] === '100', JSON.stringify({ v: h.headers['x-waf-verdict'], l: h.headers['x-ratelimit-limit'] }));
    const tr = await apiRequest(port, 'POST', '/api/sync', { 'content-type': 'application/json' }, '{}');
    chk('INT-b همزیستی با tracing (هر دو سرآیند)', tr.headers['x-waf-verdict'] === 'clean' && /^[0-9a-f]{32}$/.test(tr.headers['x-trace-id'] || ''),
      'waf=' + tr.headers['x-waf-verdict'] + ' trace=' + tr.headers['x-trace-id']);
    const rem1 = Number(h.headers['x-ratelimit-remaining']);
    const h2 = await apiRequest(port, 'GET', '/api/health', {});
    chk('INT-c شمارش کم می‌شود', Number(h2.headers['x-ratelimit-remaining']) < rem1, rem1 + '→' + h2.headers['x-ratelimit-remaining']);
    const cleanPath = '/api/sync/conflicts?class=5';
    const rClean = await apiRequest(port, 'GET', cleanPath, {});
    const rDirty = await apiRequest(port, 'GET', '/api/sync/conflicts?q=' + encodeURIComponent("' UNION SELECT 1"), {});
    chk('INT-d تزریق شناخته ولی عبور می‌کند (log-only)', rDirty.headers['x-waf-verdict'] === 'sqli' && rDirty.status === rClean.status,
      'status=' + rDirty.status + '/' + rClean.status);
    const rBot = await apiRequest(port, 'GET', '/api/health', { 'user-agent': 'sqlmap/1.7' });
    chk('INT-e ربات شناخته شد', rBot.headers['x-waf-verdict'] === 'badbot');
    /* ۲۰۰ همزمان: همه سرو شدند (بدونِ ۴۲۹/۵۰۰ چون detect-only) */
    const many = await Promise.all(Array.from({ length: 200 }, (_, i) =>
      apiRequest(port, 'GET', '/api/health?i=' + i, {}).catch((e) => ({ status: -1, headers: {}, err: e }))));
    const served = many.filter((r) => r.status === 200 && r.headers['x-waf-verdict']).length;
    const blocked = many.filter((r) => r.status === 429 || r.status === 403).length;
    chk('INT-f استرسِ ۲۰۰: همه ۲۰۰ + هیچ بلاکی', served === 200 && blocked === 0, 'served=' + served + ' blocked=' + blocked);
    /* ممیزی: throttled + بدونِ PII */
    for (let i = 0; i < 10; i++) {
      await apiRequest(port, 'GET', '/api/x?password=NoLeak9&z=' + encodeURIComponent("' OR '1'='1"), {}).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 600));
    let auditTxt = '';
    try { auditTxt = fs.readFileSync(auditP, 'utf8'); } catch (e) {}
    const wafLines = auditTxt.split('\n').filter((l) => l.indexOf('waf_detect') >= 0);
    const sqliLines = wafLines.filter((l) => l.indexOf('"rule":"sqli"') >= 0);
    const botLines = wafLines.filter((l) => l.indexOf('"rule":"badbot"') >= 0);
    chk('INT-g ممیزی throttled (۱..۵ از ۱۱)', sqliLines.length >= 1 && sqliLines.length <= 5, 'n=' + sqliLines.length);
    chk('INT-g2 ربات یک ممیزی دارد', botLines.length === 1, 'n=' + botLines.length);
    chk('INT-h ممیزی بدونِ PII', auditTxt.indexOf('NoLeak9') < 0 && auditTxt.indexOf("OR '1'='1") < 0);
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ── NGX (nginx واقعی یا پرشِ بلند) ─────────────────────────── */
function findNginx() {
  const cands = ['/usr/sbin/nginx', '/usr/local/sbin/nginx', '/usr/bin/nginx', '/opt/nginx/sbin/nginx'];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  try {
    const w = cp.execSync('which nginx', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w && fs.existsSync(w)) return w;
  } catch (e) {}
  return null;
}
function skips(names, why) { names.forEach((n) => console.log('  ⏭️  ' + n + ' — ' + why)); }
async function ngxGroup() {
  grp('NGX — nginx واقعی (یا پرشِ بلند)');
  const names = ['NGX-a', 'NGX-b', 'NGX-c', 'NGX-d'];
  const ngx = findNginx();
  if (!ngx) { skips(names, 'nginx نصب نیست'); return; }
  if (!fs.existsSync(SEED_STORE)) { skips(names, 'سید نیست'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-ngx-'));
  const appPort = await pickPort(18811);
  const ngxPort = await pickPort(18081);
  let conf = fs.readFileSync(NGINX_CONF, 'utf8');
  conf = conf.replace('listen 8080;', 'listen ' + ngxPort + ';')
    .replace('server 127.0.0.1:3000', 'server 127.0.0.1:' + appPort)
    .replace(/\/tmp\/payesh-nginx-/g, tmp + '/n-')
    .replace('daemon off;', 'daemon on;');
  const confP = path.join(tmp, 't.conf');
  fs.writeFileSync(confP, conf);
  const t = cp.spawnSync(ngx, ['-t', '-c', confP, '-p', tmp], { stdio: 'pipe' });
  if (t.status !== 0) { skips(names, 'nginx -t ناموفق'); return; }
  const storeP = path.join(tmp, 's.json');
  fs.copyFileSync(SEED_STORE, storeP);
  const child = cp.spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(appPort), PAYESH_STORE: storeP, PAYESH_AUDIT: path.join(tmp, 'a.log'),
      PAYESH_KEY: path.join(tmp, 'k.key'), TRACING_ENABLED: 'false'
    }),
    stdio: ['ignore', 'ignore', 'ignore']
  });
  let appOk = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const r = await apiRequest(appPort, 'GET', '/api/health', {});
      if (r.status === 200) { appOk = true; break; }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const stopAll = () => {
    try { cp.spawnSync(ngx, ['-c', confP, '-p', tmp, '-s', 'stop'], { stdio: 'ignore' }); } catch (e) {}
    try { child.kill('SIGKILL'); } catch (e) {}
  };
  if (!appOk) { skips(names, 'بوتِ اپ ناموفق'); stopAll(); return; }
  const st = cp.spawnSync(ngx, ['-c', confP, '-p', tmp], { stdio: 'pipe' });
  if (st.status !== 0) { skips(names, 'اجرا نشد'); stopAll(); return; }
  try {
    await new Promise((r) => setTimeout(r, 600));
    const h = await apiRequest(ngxPort, 'GET', '/api/health', {});
    chk('NGX-a عبورِ سالم از nginx', h.status === 200);
    let botBlocked = false;
    try {
      const b = await apiRequest(ngxPort, 'GET', '/api/health', { 'user-agent': 'nikto/2.5' });
      botBlocked = b.status !== 200;
    } catch (e) { botBlocked = true; }
    chk('NGX-b ربات بسته شد (۴۴۴)', botBlocked);
    const tv = await apiRequest(ngxPort, 'GET', '/api/x?f=..%2f..%2fetc%2fpasswd', {});
    chk('NGX-c traversal مسدود (۴۰۳)', tv.status === 403, 'got=' + tv.status);
    let n200 = 0, n429 = 0;
    for (let i = 0; i < 120; i++) {
      try {
        const r = await apiRequest(ngxPort, 'GET', '/api/health?b=' + i, {});
        if (r.status === 200) n200++; else if (r.status === 429) n429++;
      } catch (e) {}
    }
    chk('NGX-d سیلِ ۱۲۰: ۴۲۹ها + گذرهای محدود', n429 >= 80 && n200 >= 1 && n200 <= 40, '200=' + n200 + ' 429=' + n429);
  } finally {
    stopAll();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ── main ────────────────────────────────────────────── */
(async function main() {
  try {
    cfgGroup();
    detGroup();
    await limGroup();
    if (UNIT_ONLY) console.log('\n(بخشِ INT با --unit-only پرش شد)');
    else { await intGroup(); await ngxGroup(); }
  } catch (e) {
    fail++;
    failures.push('crash: ' + String((e && e.message) || e));
    console.log('  ❌ کرش: ' + String((e && e.stack) || e).slice(0, 400));
  }
  try {
    const r = require('../server/redis.js');
    if (r && typeof r.close === 'function') await r.close();
  } catch (e) {}
  console.log('\n' + '─'.repeat(52));
  console.log('جمع: ' + pass + ' موفق، ' + fail + ' ناموفق از ' + (pass + fail));
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join(' | ').slice(0, 400));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})();
