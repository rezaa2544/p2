#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server14 — GCِ وضعیتِ داخلیِ سرور (دور 85, P1-3 — AD 85.2)
   ───────────────────────────────────────────────────────────────────
   store را با ورودی‌های کهنه seed می‌کنیم:
     __processed_uids : 31 روز پیش + 1 روز پیش
     __revoked_jti    : 9 ساعت پیش + 1 ساعت پیش
     __auth.codes     : 10 دقیقه پیش (منقضی) + 1 دقیقه پیش (زنده) → مهاجرت به otp.json (R101)
   بعد از یک persist، باید فقط کهنه‌ها پاک شده باشند و:
     • uidِ زنده هنوز duplicate_ignored بدهد (کонтراکت ایدمپوتانس)
     • uidِ کهنه (پاک‌شده) قابلِ ری‌پلای باشد (سازگار با ایدمپوتانس)
     • حجمِ فایلِ store راکد/کاهش یابد، نه افزایش
   اجرا: node tests/server14-gc.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, setCookie: res.headers['set-cookie'] }); });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    if (data) req.write(data);
    req.end();
  });
}
function cookieFrom(r) {
  const sc = r.setCookie || [];
  for (const c of Array.isArray(sc) ? sc : [sc]) {
    const kv = String(c).split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) return kv.slice(0, i) + '=' + kv.slice(i + 1);
  }
  return '';
}

process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
let tmp = null;

async function main() {
  console.log('\n▸ دور 85 — P1-3: GCِ وضعیتِ داخلیِ سرور (AD 85.2)');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s14-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');

  /* ── seed: ورودی‌های کهنه + زنده در سه نقشهٔ داخلی ── */
  const now = Date.now();
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  src.__processed_uids = { 'gc-old-uid': now - 31 * 86400000, 'gc-new-uid': now - 1 * 86400000 };
  src.__revoked_jti = { 'gc-old-jti': now - 9 * 3600000, 'gc-new-jti': now - 1 * 3600000 };
  src.__auth = src.__auth || { codes: {}, login_fail: {}, code_rate: {}, enum: {} };
  src.__auth.codes['+989900000001'] = { code: '1234', at: now - 10 * 60000, user_id: 1, tries: 0 };
  src.__auth.codes['+989900000002'] = { code: '5678', at: now - 1 * 60000, user_id: 1, tries: 0 };
  fs.writeFileSync(storeFile, JSON.stringify(src), { mode: 0o600 });
  const sizeBefore = fs.statSync(storeFile).size;

  const M = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  chk('G0 حسابِ مدیرِ seed موجود است', !!M);
  if (!M) process.exit(1);

  let port = null, srv = null;
  for (const p of [8987, 8986]) {
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
      const h = await httpReq(p, 'GET', '/api/health').then(r => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break;
      await sleep(300);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  chk('G1 سرورِ واقعی با storeِ seedشده بالا آمد', port !== null);
  if (port === null) { console.log('\n❌ server14: ' + errors.join(' | ')); process.exit(1); }

  const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone: M.phone });
  const code = sc.json && sc.json.demo_code;
  const lg = await httpReq(port, 'POST', '/api/auth/login', { phone: M.phone, code, national_id: M.national_id });
  const cM = lg.json && lg.json.ok ? cookieFrom(lg) : null;
  chk('G2 نشستِ مدیر ساخته شد', !!cM);
  if (!cM) { console.log('\n❌ server14: ' + errors.join(' | ')); process.exit(1); }

  const leaf = (reason) => ({ school_id: 1, student_id: 16, from_date: '2026-09-10', to_date: '2026-09-10', reason, status: 'pending', created_at: '2026-09-07' });
  async function syncOps(uid, reason) {
    const r = await httpReq(port, 'POST', '/api/sync', {
      ops: [{ uid, by: M.id, at: new Date().toISOString(), t: 'ins', c: 'leaves', data: leaf(reason) }]
    }, cM);
    return r.json && r.json.results && r.json.results[0];
  }

  /* ── کنترل: ایدمپوتانسِ زنده + تحریکِ persist (apply = dirty) ── */
  const a1 = await syncOps('gc-ctrl', 'GC test A');
  chk('G3 opِ تازه: اولین پخش → ok (و store را dirty می‌کند)', a1 && a1.ok, JSON.stringify(a1));
  const a2 = await syncOps('gc-ctrl', 'GC test A');
  chk('G4 ری‌پلای: duplicate_ignored (کنترکت ایدمپوتانس)', a2 && a2.ok && a2.code === 'duplicate_ignored', JSON.stringify(a2));
  /* R95 — سخت‌سازی (کلاسِ R92/R93: sleepِ ثابت → رأیِ محیطیِ کاذب):
     پنجرهٔ ۳ ثانیهٔ ثابت تحتِ بارِ موازیِ رجیسیون (دوِ لِین + لِینِ پورت)
     گاه کوتاه‌تر از یک دورِ persist+GC (هر ۲ ثانیه) می‌شد و G5–G9 کاذب
     قرمز می‌شدند (خودِ GC سالم — تکرارِ تکی سبز). حالا تا ۱۵ ثانیه فایل را
     تا نشستنِ GC پُل می‌کنیم؛ اگر GC مرده باشد (جهش M4 / باگ) پُل وقتش را
     می‌گیرد و چک‌ها همان‌طور که باید شکست می‌خورند. */
  /* R97 — پنجره ۱۵s (R95) دوباره تحتِ بارِ ۴ لِینِ رجیسیون کوتاه بود
     (server14-gc-mutations دو بار کاذبِ قرمز، تکرارِ تکی سبز): ۳۰s. */
  let after = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    after = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    if (!after.__processed_uids['gc-old-uid'] && !after.__revoked_jti['gc-old-jti']
        && !((after.__auth || {}).codes || {})['+989900000001']) break;
  }
  chk('G5 GC: uidِ کهنه (31 روز) پاک شد', !after.__processed_uids['gc-old-uid']);
  chk('G5b GC: uidِ زنده (1 روز) ماند', !!after.__processed_uids['gc-new-uid']);
  chk('G6 GC: jtiِ کهنه (9 ساعت) پاک شد', !after.__revoked_jti['gc-old-jti']);
  chk('G6b GC: jtiِ زنده (1 ساعت) ماند', !!after.__revoked_jti['gc-new-jti']);
  const otpAfter = JSON.parse(fs.readFileSync(path.join(tmp, 'otp.json'), 'utf8')); /* R101: کدها در otp.json (مهاجرت از __auth) */
  chk('G7 GC: کدِ منقضی (10 دقیقه) پاک شد', !(otpAfter.codes || {})['+989900000001']);
  chk('G7b GC: کدِ زنده (1 دقیقه) ماند', !!((otpAfter.codes || {})['+989900000002']));

  const oldKeys = (st) => (st.__processed_uids['gc-old-uid'] ? 1 : 0)
                         + (st.__revoked_jti['gc-old-jti'] ? 1 : 0)
                         + (((st.__auth || {}).codes || {})['+989900000001'] ? 1 : 0);
  const mapBytes = (st) => JSON.stringify({ u: st.__processed_uids, j: st.__revoked_jti, c: (st.__auth || {}).codes || {} }).length;
  chk('G8 حجمِ store: ۳ کلیدِ کهنه پاک شدند و نقشه‌ها در حدِ ناچیز ماندند',
      oldKeys(after) === 0 && mapBytes(after) < 400,
      'oldKeys=' + oldKeys(after) + ' mapBytes=' + mapBytes(after));

  /* ── قرارداد: uidِ کهنه پس از GC قابلِ ری‌پلای است ── */
  const a3 = await syncOps('gc-old-uid', 'GC test B');
  chk('G9 uidِ کهنه پس از GC: ری‌پلای → ok (نه duplicate)', a3 && a3.ok && a3.code !== 'duplicate_ignored', JSON.stringify(a3));

  srv.kill('SIGKILL');
  console.log('\nserver14 (GC): ' + pass + ' بررسی — ' + (fail === 0 ? '✅ همه سبز' : '❌ ' + fail + ' خطا'));
  if (fail > 0) console.log(errors.join('\n'));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
