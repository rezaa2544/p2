#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۶ — ترک تحصیل: دامنه‌بندیِ سمتِ سرور (سرورِ واقعی، شبکهٔ واقعی)
   ───────────────────────────────────────────────────────────────────
   S1 مدیرِ مدرسهٔ خودش: ثبتِ ترک → ok
   S2 مدیرِ مدرسهٔ دیگر: همان دانش‌آموز → out_of_scope (fail-closed)
   S3 دبیر: فیلدهایِ ترک → role_denied (محدود به کلیدهای IEP)
   S4 مدیر: فیلدهایِ ترک + کلیدِ اضافی (password) → role_denied
   S5 مدیر: ارتقا (status awaiting_transfer + grade_level) → ok
      (روندهایِ موجودِ تغییرِ وضعیت، خراب نشده‌اند)
   S6 مدیر: بازگشت (status active + returned_at) → ok
   S7 داده روی disk: فیلدهایِ درست؛ سابقهٔ ترک در بازگشت می‌ماند
   اجرا: node tests/dropout2.js
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

async function main() {
  console.log('\n▸ دور 76 — ترک تحصیل: دامنه‌بندیِ سمتِ سرور (سرورِ واقعی)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-drop-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));

  const ST = src.users.find(u => u.role === 'student' && u.school_id === 1);
  const M1 = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  const M2 = src.users.find(u => u.role === 'manager' && u.school_id === 2);
  const T1 = src.users.find(u => u.role === 'teacher' && u.school_id === 1);
  chk('P0 حساب‌ها موجودند (دانش‌آموز/مدیر_۱/مدیر_۲/دبیر)', !!(ST && M1 && M2 && T1));
  if (!(ST && M1 && M2 && T1)) process.exit(1);

  let port = null, srv = null;
  for (const p of [8995, 8994]) {
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
  chk('P1 سرورِ واقعی بالا آمد', port !== null);
  if (port === null) process.exit(1);

  async function login(u) {
    const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json && sc.json.demo_code;
    const lg = await httpReq(port, 'POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    if (!(lg.json && lg.json.ok)) return null;
    return cookieFrom(lg);
  }
  const cM1 = await login(M1);
  const cM2 = await login(M2);
  const cT1 = await login(T1);
  chk('S0 سه نشستِ واقعی ساخته شد (مدیر_۱، مدیر_۲، دبیر)', !!(cM1 && cM2 && cT1));

  let seq = 0;
  async function syncOp(cookie, data, byId) {
    const r = await httpReq(port, 'POST', '/api/sync', { ops: [{ t: 'upd', c: 'users', id: ST.id, data, by: byId, uid: 'drop-' + (++seq) }] }, cookie);
    return r.json || {};
  }

  /* S1 — مدیرِ مدرسهٔ خودش: ثبتِ ترک */
  const r1 = await syncOp(cM1, { status: 'dropped_out', active: 0, dropped_out_at: '2026-09-01', dropped_out_by: M1.id, dropped_out_reason: 'economic', dropped_out_note: 'مستند شده' }, M1.id);
  const s1 = r1.results && r1.results[0];
  chk('S1 مدیرِ مدرسهٔ خودش: ثبتِ ترک → ok', s1 && s1.ok, JSON.stringify(r1).slice(0, 140));

  /* S2 — مدیرِ مدرسهٔ دیگر: fail-closed */
  const r2 = await syncOp(cM2, { status: 'dropped_out', active: 0, dropped_out_at: '2026-09-01', dropped_out_by: M2.id, dropped_out_reason: 'other' }, M2.id);
  const s2 = r2.results && r2.results[0];
  chk('S2 مدیرِ مدرسهٔ دیگر: out_of_scope (fail-closed)', s2 && !s2.ok && s2.code === 'out_of_scope', JSON.stringify(r2).slice(0, 140));

  /* S3 — دبیر: role_denied */
  const r3 = await syncOp(cT1, { status: 'dropped_out', active: 0, dropped_out_at: '2026-09-01', dropped_out_by: T1.id, dropped_out_reason: 'other' }, T1.id);
  const s3 = r3.results && r3.results[0];
  chk('S3 دبیر: role_denied (فقط کلیدهای IEP)', s3 && !s3.ok && s3.code === 'role_denied', JSON.stringify(r3).slice(0, 140));

  /* S4 — مدیر: فیلدهایِ ترک + کلیدِ اضافی */
  const r4 = await syncOp(cM1, { status: 'dropped_out', active: 0, dropped_out_at: '2026-09-02', dropped_out_reason: 'other', password: 'x' }, M1.id);
  const s4 = r4.results && r4.results[0];
  chk('S4 مدیر با کلیدِ اضافی (password): role_denied', s4 && !s4.ok && s4.code === 'role_denied', JSON.stringify(r4).slice(0, 140));

  /* S5 — رهنمودهٔ موجود: ارتقا (بدونِ فیلدهایِ ترک) */
  const r5 = await syncOp(cM1, { status: 'awaiting_transfer', grade_level: 11 }, M1.id);
  const s5 = r5.results && r5.results[0];
  chk('S5 ارتقا (روندِ موجود) هنوز ok است — درِ سفیدِ ترک، آن را نشکسته', s5 && s5.ok, JSON.stringify(r5).slice(0, 140));

  /* S6 — بازگشت */
  const r6 = await syncOp(cM1, { status: 'active', active: 1, returned_at: '2026-09-10', returned_by: M1.id }, M1.id);
  const s6 = r6.results && r6.results[0];
  chk('S6 بازگشت به تحصیل → ok', s6 && s6.ok, JSON.stringify(r6).slice(0, 140));

  /* S7 — داده روی disk (flush هر ۲ ثانیه — poll تا نشست) */
  let finalSrc = null;
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const cand = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    const cu = cand.users.find(u => u.id === ST.id);
    if (cu && cu.returned_at) { finalSrc = cand; break; }
  }
  if (!finalSrc) finalSrc = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const fu = finalSrc.users.find(u => u.id === ST.id);
  const origPass = src.users.find(u => u.id === ST.id).password;
  chk('S7-a روی disk: status active + returned_at', fu.status === 'active' && fu.returned_at === '2026-09-10', JSON.stringify(fu).slice(0, 140));
  chk('S7-b روی disk: سابقهٔ ترک (دلیل/تاریخ/ثبت‌کننده) در بازگشت ماند',
      fu.dropped_out_reason === 'economic' && fu.dropped_out_at === '2026-09-01' && fu.dropped_out_by === M1.id,
      JSON.stringify(fu).slice(0, 140));
  chk('S7-c روی disk: کلیدِ password دست‌نخورده ماند (S4 اثر نکرده)', fu.password === origPass, JSON.stringify(fu).slice(0, 140));

  srv.kill('SIGKILL');
  console.log('\n' + '─'.repeat(52));
  console.log(`دامنه‌بندیِ سرورِ ترک تحصیل: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (fail) { console.log('ناموفق:'); errors.slice(0, 10).forEach((e) => console.log('  ' + e)); }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
