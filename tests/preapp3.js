#!/usr/bin/env node
/**
 * تستِ سرور: دسترسی‌های قیف پیش‌ثبت‌نام (بند ۴.۴)
 *  - مدیر: ins/upd/del روی preapps مجاز
 *  - دبیر: ins preapps → 403 role_denied
 *  - اثر عملیات در store ماندگار می‌ماند
 *
 * اجرا:  node tests/preapp3.js   (سرور را خودش بالا می‌آورد؛ پورت 8999)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 8999;
const BASE = `http://127.0.0.1:${PORT}`;

function http(method, url, body, cookie) {
  return fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})), hdr: r.headers.get('set-cookie') || '' }));
}
let opSeq = 0;
function op(uid, c, t, id, data) {
  opSeq += 1;
  return { uid: 'pa3-' + Date.now() + '-' + opSeq, c, t, id: id ?? null, data: data ?? {}, by: uid, at: new Date().toISOString() };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

async function main() {
console.log('\n▸ سرور: دسترسی‌های preapps (بند ۴.۴)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-preapp-'));
const store = path.join(dir, 'store.json');
const seed = path.join(ROOT, 'server/data/payesh.json');
if (!fs.existsSync(seed)) { console.error('⚠️ server/data/payesh.json نیست — اول: node server/seed.js'); process.exit(1); }
fs.copyFileSync(seed, store);
const child = spawn('node', [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PAYESH_STORE: store, PAYESH_AUDIT: path.join(dir, 'audit.jsonl'), PAYESH_JWT_SECRET: 'preapp-test-secret', PAYESH_DEMO_CODE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += String(d); });
child.stderr.on('data', (d) => { out += String(d); });
const up = new Promise((res, rej) => {
  let done = false;
  const iv = setInterval(async () => {
    if (done) return;
    try { const r = await http('GET', '/api/health'); if (r.status === 200) { done = true; clearInterval(iv); res(); } } catch {}
  }, 300);
  setTimeout(() => { if (!done) rej(new Error('سرور بالا نیامد: ' + out.slice(-300))); }, 12000);
});
await up;
console.log('  (سرور روی ' + PORT + ' بالا آمد)');

try {
  const store0 = JSON.parse(fs.readFileSync(store, 'utf8'));
  const mgrU = store0.users.find((u) => u.role === 'manager' && u.school_id === 1 && u.active);
  const teaU = store0.users.find((u) => u.role === 'teacher' && u.school_id === 1 && u.active);
  if (!mgrU || !teaU) { console.error('  ❌ مدیر/دبیرِ نمونه پیدا نشد'); process.exit(1); }

  const login = async (u) => {
    const sc = await http('POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json.demo_code || sc.json.code || '000000';
    const lg = await http('POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    return lg.hdr.split(';')[0];
  };
  const mgrC = await login(mgrU);
  const teaC = await login(teaU);

  const sc1 = mgrU.school_id;

  /* A1: مدیر ins preapps */
  const ins = await http('POST', '/api/sync', { ops: [op(mgrU.id, 'preapps', 'ins', null, { school_id: sc1, name: 'داوطلبِ سرور', phone: '09351112222', note: '', stage: 'contact', stage_at: '2026-09-01', created_at: '2026-09-01' })] }, mgrC);
  T(ins.status === 200, 'A1 مدیر: ins preapps → 200 (گرفت: ' + ins.status + ' ' + JSON.stringify(ins.json).slice(0,120) + ')');

  /* A2: دبیر ins preapps → 403 */
  const tins = await http('POST', '/api/sync', { ops: [op(teaU.id, 'preapps', 'ins', null, { school_id: sc1, name: 'خرابکار', phone: '09359999999', stage: 'contact', stage_at: '2026-09-01', created_at: '2026-09-01' })] }, teaC);
  T(tins.status === 403, 'A2 دبیر: ins preapps → 403 (گرفت: ' + tins.status + ')');
  T(tins.json && tins.json.code === 'role_denied', 'A2b کد خطا role_denied (گرفت: ' + (tins.json && tins.json.code) + ')');

  /* A1b: فلش → ردیفِ ساخته‌شده در store (id از همین‌جا) */
  await sleep(2300);
  let st = JSON.parse(fs.readFileSync(store, 'utf8'));
  let row = (st.preapps || []).find((r) => r.name === 'داوطلبِ سرور');
  T(!!row, 'A1b ردیفِ ساخته‌شده در store است');
  const pid = row ? row.id : 0;
  if (!pid) { console.log('  (بدون id — بقیهٔ تست‌ها رد می‌شوند)'); }

  /* A3: مدیر upd مرحله */
  const upd = await http('POST', '/api/sync', { ops: [op(mgrU.id, 'preapps', 'upd', pid, { stage: 'exam', stage_at: '2026-09-05' })] }, mgrC);
  T(upd.status === 200, 'A3 مدیر: upd مرحله → 200 (گرفت: ' + upd.status + ')');

  /* A4: فلش → مرحلهٔ به‌روز رسیده */
  await sleep(2300);
  st = JSON.parse(fs.readFileSync(store, 'utf8'));
  row = (st.preapps || []).find((r) => r.id === pid);
  T(row && row.stage === 'exam', 'A4 فلش: مرحلهٔ به‌روزشده (exam) در store است');

  /* A5: مدیر del + فلش + بررسیِ نبود */
  const del = await http('POST', '/api/sync', { ops: [op(mgrU.id, 'preapps', 'del', pid)] }, mgrC);
  T(del.status === 200, 'A5 مدیر: del preapps → 200');
  await sleep(2300);
  st = JSON.parse(fs.readFileSync(store, 'utf8'));
  const found = (st.preapps || []).find((r) => r.name === 'داوطلبِ سرور');
  T(!found, 'A5b ردیفِ حذف‌شده دیگر در store نیست');
  const fake = (st.preapps || []).find((r) => r.name === 'خرابکار');
  T(!fake, 'A4 ردیفِ مسدودشدهٔ دبیر در store نیست');
} finally {
  child.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\npreapp3 (سرور): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
