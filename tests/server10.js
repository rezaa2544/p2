#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   صفحهٔ وبِ سیاستِ حریم خصوصی (بند 15.3 — ملاکِ گوگل‌پلی:
   سیاست باید هم داخلِ اپ و هم به‌عنوانِ صفحهٔ وب در دسترس باشد)
     P1  /privacy → 200 + text/html + نه بخشِ سیاست
     P2  صفحهٔ خودکفا: هیچ منبعِ خارجی (http/https در src/href) نیست
     P3  CSP: سرآیند با nonce + جای‌نکهدارِ بیلد پر شده
     P4  alias /privacy.html هم می‌سازد
     P5  هم‌گامی با متنِ داخلِ اپ (عبارت‌های کلیدی مشترک)
     P6  لینکِ صفحهٔ حذفِ حساب (مسیرِ نسبی)
   اجرا: node tests/server10.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
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
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json: j, raw: b });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, json: null, raw: '' }));
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('\n▸ صفحهٔ وبِ سیاستِ حریم خصوصی (15.3)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s10-'));
  process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');

  let port = null, srv = null;
  for (const p of [8996, 8997]) {
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
  chk('P0 سرور بالا آمد (با pidِ خودِ این spawn)', port !== null);
  if (port === null) { console.log('  ⚠ بدون سرور، ادامه ممکن نیست'); process.exit(1); }

  // P1: صفحه می‌سازد و بخش‌ها کامل‌اند
  const r = await httpReq(port, 'GET', '/privacy');
  const SECTIONS = ['چه داده‌ای جمع می‌کنیم', 'داده کجا می‌ماند', 'چه چیزی جمع نمی‌کنیم',
    'موقعیتِ مکانی', 'حریم دانش‌آموزان', 'امنیت حساب', 'حذف حساب و داده', 'تغییرات این سیاست', 'تماس'];
  const missing = SECTIONS.filter((t) => r.raw.indexOf(t) === -1);
  chk('P1 /privacy: 200 + text/html + نه بخشِ سیاست',
    r.status === 200 && /text\/html/.test(r.headers['content-type'] || '') && missing.length === 0,
    'بخش‌های گم‌شده: ' + missing.join('، '));

  // P2: خودکفا — هیچ منبعِ خارجی
  const extRefs = (r.raw.match(/(?:src|href)\s*=\s*["']https?:/g) || []);
  chk('P2 صفحهٔ خودکفا است (هیچ src/href خارجی)', extRefs.length === 0, extRefs.join(' '));

  // P3: CSP با nonce + جای‌نکهدارِ پر شده
  const csp = r.headers['content-security-policy'] || '';
  chk('P3 CSP: سرآیند با nonce + بدونِ جای‌نکهدارِ خام',
    /nonce-/.test(csp) && r.raw.indexOf('__PAYESH_NONCE__') === -1, csp.slice(0, 100));

  // P4: alias
  const r2 = await httpReq(port, 'GET', '/privacy.html');
  chk('P4 alias /privacy.html هم 200', r2.status === 200 && /text\/html/.test(r2.headers['content-type'] || ''), r2.raw.slice(0, 80));

  // P5: هم‌گامی با متنِ داخلِ اپ
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const shared = ['رمز عبور وجود ندارد', 'نه فقط غیرفعال', 'فروشیده یا با کسی به‌اشتراک گذاشته نمی‌شود'];
  const missingShared = shared.filter((t) => indexHtml.indexOf(t) === -1 || r.raw.indexOf(t) === -1);
  chk('P5 هم‌گامی: عبارت‌های کلیدی در هر دو نسخه (وب + اپ)', missingShared.length === 0,
    'عبارت‌های ناسازگار: ' + missingShared.join('، '));

  // P6: لینکِ حذفِ حساب (مسیرِ نسبی)
  chk('P6 لینکِ /account-deletion در صفحهٔ سیاست',
    /href="\/account-deletion"/.test(r.raw), r.raw.match(/href="[^"]*account[^"]*"/) || 'یافت نشد');

  srv.kill('SIGKILL');
  await sleep(200);

  console.log('\n' + '─'.repeat(52));
  console.log(`server10 (سیاستِ وب): ${pass} بررسی — ✅ ${pass} · ❌ ${fail}`);
  if (fail) { console.log(errors.join('\n')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
