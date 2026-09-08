#!/usr/bin/env node
/**
 * تستِ سرور: دسترسی‌های کمک‌هزینه (بند ۲.۴)
 *  - مدیر: ins/upd/del روی scholarships مجاز
 *  - مدیرِ مدرسهٔ ۱ روی رکوردِ مدرسهٔ ۲: out_of_scope
 *  - دبیر: ins → 403 role_denied
 *  - اثر عملیات در store ماندگار می‌ماند
 *
 * اجرا:  node tests/scholarship3.js   (پورت 8998)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { opX } = require('./helpers/opx');

const ROOT = path.join(__dirname, '..');
const PORT = 8998;
const BASE = `http://127.0.0.1:${PORT}`;

function http(method, url, body, cookie) {
  return fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})), hdr: r.headers.get('set-cookie') || '' }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

async function main() {
console.log('\n▸ سرور: دسترسی‌های scholarships (بند ۲.۴)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-scholar-'));
const store = path.join(dir, 'store.json');
const seed = path.join(ROOT, 'server/data/payesh.json');
if (!fs.existsSync(seed)) { console.error('⚠️ server/data/payesh.json نیست — اول: node server/seed.js'); process.exit(1); }
fs.copyFileSync(seed, store);
const child = spawn('node', [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PAYESH_STORE: store, PAYESH_AUDIT: path.join(dir, 'audit.jsonl'), PAYESH_JWT_SECRET: require('crypto').randomBytes(32).toString('hex'), PAYESH_DEMO_CODE: '1' },
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
  const mgr2 = store0.users.find((u) => u.role === 'manager' && u.school_id === 2 && u.active);
  const teaU = store0.users.find((u) => u.role === 'teacher' && u.school_id === 1 && u.active);
  const stU = store0.users.find((u) => u.role === 'student' && u.school_id === 1 && u.active);
  if (!mgrU || !mgr2 || !teaU || !stU) { console.error('  ❌ زمینهٔ دمو پیدا نشد'); process.exit(1); }

  const login = async (u) => {
    const sc = await http('POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json.demo_code || sc.json.code || '000000';
    const lg = await http('POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    return lg.hdr.split(';')[0];
  };
  const mgrC = await login(mgrU);
  const mgr2C = await login(mgr2);
  const teaC = await login(teaU);

  /* B1: مدیر ins */
  const ins = await http('POST', '/api/sync', { ops: [opX({ by: mgrU.id, collection: 'scholarships', type: 'ins', data: { school_id: 1, student_id: stU.id, status: 'requested', note: 'تست سرور', created_at: '2026-09-01', updated_at: '2026-09-01' } })] }, mgrC);
  const b1s = ins.json && ins.json.results && ins.json.results[0];
  T(ins.status === 200 && b1s && b1s.ok === true, 'B1 مدیر: ins scholarships → 200 + ok (R96 per-op) (گرفت: ' + ins.status + ' ' + JSON.stringify(ins.json).slice(0, 120) + ')');

  /* B2: مدیرِ مدرسهٔ ۲ روی مدرسهٔ ۱ → out_of_scope */
  const evil = await http('POST', '/api/sync', { ops: [opX({ by: mgr2.id, collection: 'scholarships', type: 'ins', data: { school_id: 1, student_id: stU.id, status: 'approved', note: 'تجاوز', created_at: '2026-09-01', updated_at: '2026-09-01' } })] }, mgr2C);
  T(evil.status === 403 && evil.json && evil.json.code === 'out_of_scope', 'B2 مدیرِ مدرسهٔ ۲ روی مدرسهٔ ۱ → out_of_scope (گرفت: ' + evil.status + ' ' + (evil.json && evil.json.code) + ')');

  /* B3: دبیر ins → role_denied */
  const tins = await http('POST', '/api/sync', { ops: [opX({ by: teaU.id, collection: 'scholarships', type: 'ins', data: { school_id: 1, student_id: stU.id, status: 'requested', note: 'دبیر', created_at: '2026-09-01', updated_at: '2026-09-01' } })] }, teaC);
  /* R96: رد per-op از fieldGate یا ردِ دامنه‌ای (out_of_scope) — هر دو fail-closed */
  const tinsS = tins.json && tins.json.results && tins.json.results[0];
  T((tins.status === 403 && tins.json && ['role_denied', 'out_of_scope'].includes(tins.json.code)) || (tins.status === 200 && tinsS && !tinsS.ok && ['role_denied', 'out_of_scope'].includes(tinsS.code)), 'B3 دبیر: ins → رد (گرفت: ' + tins.status + ' ' + (tins.json && (tins.json.code || (tinsS && tinsS.code))) + ')');

  /* B4: فلش → رکورد در store + id */
  await sleep(2300);
  let st = JSON.parse(fs.readFileSync(store, 'utf8'));
  let row = (st.scholarships || []).find((r) => r.note === 'تست سرور');
  T(!!row, 'B4 رکوردِ ساخته‌شده در store است');
  const pid = row ? row.id : 0;

  /* B5: مدیر upd وضعیت */
  const upd = await http('POST', '/api/sync', { ops: [opX({ by: mgrU.id, collection: 'scholarships', type: 'upd', id: pid, data: { status: 'approved', updated_at: '2026-09-05' } })] }, mgrC);
  T(upd.status === 200, 'B5 مدیر: upd وضعیت → 200');
  await sleep(2300);
  st = JSON.parse(fs.readFileSync(store, 'utf8'));
  row = (st.scholarships || []).find((r) => r.id === pid);
  T(row && row.status === 'approved', 'B6 فلش: وضعیتِ تأییدشده در store است');

  /* B7: رکوردهای مسدودشده در store نیستند */
  T(!(st.scholarships || []).some((r) => r.note === 'تجاوز'), 'B7 رکوردِ out_of_scope در store نیست');
  T(!(st.scholarships || []).some((r) => r.note === 'دبیر'), 'B7b رکوردِ دبیر در store نیست');
} finally {
  child.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nscholarship3 (سرور): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
