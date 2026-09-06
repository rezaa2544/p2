#!/usr/bin/env node
/**
 * تستِ سرور: دسترسی‌های صورت‌جلسهٔ انجمن (بند ۶.۲)
 *  - مدیر: ins/upd روی assoc_minutes مجاز + ماندگار در store
 *  - مدیرِ مدرسهٔ دیگر روی رکوردِ مدرسهٔ ۶: out_of_scope
 *  - دبیر: ins → 403 role_denied
 *
 * اجرا:  node tests/assocmin3.js   (پورت 8996)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { opX } = require('./helpers/opx');

const ROOT = path.join(__dirname, '..');
const PORT = 8996;
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
console.log('\n▸ سرور: دسترسی‌های assoc_minutes (بند ۶.۲)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-amin-'));
const store = path.join(dir, 'store.json');
const seed = path.join(ROOT, 'server/data/payesh.json');
if (!fs.existsSync(seed)) { console.error('⚠️ server/data/payesh.json نیست — اول: node server/seed.js'); process.exit(1); }
fs.copyFileSync(seed, store);
/* مدرسهٔ ۶ (دولتیِ اندیشه) در دمو عمداً غیرفعال است — فقط در storeٔ تست فعال می‌شود */
const _st0 = JSON.parse(fs.readFileSync(store, 'utf8'));
const _s6 = _st0.schools.find((s) => s.id === 6);
if (_s6 && !_s6.active) { _s6.active = 1; fs.writeFileSync(store, JSON.stringify(_st0)); }
const child = spawn('node', [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PAYESH_STORE: store, PAYESH_AUDIT: path.join(dir, 'audit.jsonl'), PAYESH_JWT_SECRET: 'amin-test-secret', PAYESH_DEMO_CODE: '1' },
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
  const mgr6 = store0.users.find((u) => u.role === 'manager' && u.school_id === 6 && u.active);
  const mgr2 = store0.users.find((u) => u.role === 'manager' && u.school_id === 2 && u.active);
  const tea6 = store0.users.find((u) => u.role === 'teacher' && u.school_id === 6 && u.active);
  if (!mgr6 || !mgr2 || !tea6) { console.error('  ❌ زمینهٔ دمو پیدا نشد'); process.exit(1); }

  const login = async (u) => {
    const sc = await http('POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json.demo_code || sc.json.code || '000000';
    const lg = await http('POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    return lg.hdr.split(';')[0];
  };
  const mgr6C = await login(mgr6);
  const mgr2C = await login(mgr2);
  const tea6C = await login(tea6);

  const mk = (school_id, extra) => ({ school_id, meeting_date: '2026-09-10', attendees: 'تست سرور', resolutions: 'تصویبِ تست', archived: false, created_at: '2026-09-10', updated_at: '2026-09-10', ...extra });

  /* B1: مدیرِ ۶ ins */
  const ins = await http('POST', '/api/sync', { ops: [opX({ by: mgr6.id, collection: 'assoc_minutes', type: 'ins', data: mk(6, {}) })] }, mgr6C);
  T(ins.status === 200, 'B1 مدیرِ ۶: ins assoc_minutes → 200 (گرفت: ' + ins.status + ' ' + JSON.stringify(ins.json).slice(0, 120) + ')');

  /* B2: مدیرِ ۲ روی مدرسهٔ ۶ → out_of_scope */
  const evil = await http('POST', '/api/sync', { ops: [opX({ by: mgr2.id, collection: 'assoc_minutes', type: 'ins', data: mk(6, { attendees: 'تجاوز' }) })] }, mgr2C);
  T(evil.status === 403 && evil.json && evil.json.code === 'out_of_scope', 'B2 مدیرِ ۲ روی مدرسهٔ ۶ → out_of_scope (گرفت: ' + evil.status + ' ' + (evil.json && evil.json.code) + ')');

  /* B3: دبیرِ ۶ ins → role_denied */
  const tins = await http('POST', '/api/sync', { ops: [opX({ by: tea6.id, collection: 'assoc_minutes', type: 'ins', data: mk(6, { attendees: 'دبیر' }) })] }, tea6C);
  T(tins.status === 403 && tins.json && tins.json.code === 'role_denied', 'B3 دبیر: ins → 403 role_denied (گرفت: ' + tins.status + ' ' + (tins.json && tins.json.code) + ')');

  /* B4: فلش → رکورد در store */
  await sleep(2300);
  let st = JSON.parse(fs.readFileSync(store, 'utf8'));
  let row = (st.assoc_minutes || []).find((r) => r.attendees === 'تست سرور');
  T(!!row, 'B4 رکوردِ ساخته‌شده در store است');
  const rid = row ? row.id : 0;

  /* B5: مدیرِ ۶ upd (بایگانی) */
  const upd = await http('POST', '/api/sync', { ops: [opX({ by: mgr6.id, collection: 'assoc_minutes', type: 'upd', id: rid, data: { archived: true, updated_at: '2026-09-11' } })] }, mgr6C);
  T(upd.status === 200, 'B5 مدیرِ ۶: upd بایگانی → 200');
  await sleep(2300);
  st = JSON.parse(fs.readFileSync(store, 'utf8'));
  row = (st.assoc_minutes || []).find((r) => r.id === rid);
  T(row && row.archived === true, 'B6 فلش: بایگانی در store است');

  /* B7: رکوردهای مسدودشده در store نیستند */
  T(!(st.assoc_minutes || []).some((r) => r.attendees === 'تجاوز'), 'B7 رکوردِ out_of_scope در store نیست');
  T(!(st.assoc_minutes || []).some((r) => r.attendees === 'دبیر'), 'B7b رکوردِ دبیر در store نیست');
} finally {
  child.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nassocmin3 (سرور): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
