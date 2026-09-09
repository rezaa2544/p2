#!/usr/bin/env node
/**
 * تستِ سرور: دسترسی‌های کلاس‌های تابستانی (بند ۶.۴)
 *  - مدیر: ins/upd روی summer_classes مجاز + ماندگار در store
 *  - مدیرِ مدرسهٔ دیگر روی رکوردِ مدرسهٔ ۱: out_of_scope
 *  - دبیر: ins → 403 role_denied
 *
 * اجرا:  node tests/summer3.js   (پورت 8994)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { opX } = require('./helpers/opx');

const ROOT = path.join(__dirname, '..');
const PORT = 8994;
const BASE = `http://127.0.0.1:${PORT}`;

/* F-CSRF-01: نگهبانِ مرکزیِ CSRF سرور، جهش‌های احراز‌شده را بدونِ
   X-CSRF-Token رد می‌کند. تست هم مثلِ مرورگر عمل می‌کند: کوکیِ csrf_token
   را از شیشهٔ کوکی می‌خواند و در سرآیند بازمی‌گرداند (double-submit). */
const csrfHdr = (c) => { const m = /(?:^|;\s*)csrf_token=([^;]+)/.exec(String(c || '')); return m ? { 'X-CSRF-Token': m[1] } : {}; };
const jarOf = (h) => (Array.isArray(h) ? h.join(', ') : String(h || ''))
  .split(/,(?=\s*[A-Za-z0-9_!#$%&'*+\-.^`|~]+=)/)
  .map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
function http(method, url, body, cookie) {
  return fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...csrfHdr(cookie) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})), hdr: r.headers.get('set-cookie') || '' }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

async function main() {
console.log('\n▸ سرور: دسترسی‌های summer_classes (بند ۶.۴)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-summer-'));
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
  const mgr1 = store0.users.find((u) => u.role === 'manager' && u.school_id === 1 && u.active);
  const mgr2 = store0.users.find((u) => u.role === 'manager' && u.school_id === 2 && u.active);
  const tea1 = store0.users.find((u) => u.role === 'teacher' && u.school_id === 1 && u.active);
  const st1 = store0.users.find((u) => u.role === 'student' && u.school_id === 1 && u.active);
  if (!mgr1 || !mgr2 || !tea1 || !st1) { console.error('  ❌ زمینهٔ دمو پیدا نشد'); process.exit(1); }

  const login = async (u) => {
    const sc = await http('POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json.demo_code || sc.json.code || '000000';
    const lg = await http('POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    return jarOf(lg.hdr);
  };
  const mgr1C = await login(mgr1);
  const mgr2C = await login(mgr2);
  const tea1C = await login(tea1);

  const mk = (school_id, extra) => ({ school_id, name: 'تست تابستان', teacher_id: tea1.id, student_ids: [], start_date: '2026-06-15', end_date: '2026-07-15', note: '', created_at: '2026-06-01', updated_at: '2026-06-01', ...extra });

  /* B1: مدیرِ ۱ ins */
  const ins = await http('POST', '/api/sync', { ops: [opX({ by: mgr1.id, collection: 'summer_classes', type: 'ins', data: mk(1, {}) })] }, mgr1C);
  const b1s = ins.json && ins.json.results && ins.json.results[0];
  T(ins.status === 200 && b1s && b1s.ok === true, 'B1 مدیرِ ۱: ins summer_classes → 200 + ok (R96 per-op) (گرفت: ' + ins.status + ' ' + JSON.stringify(ins.json).slice(0, 120) + ')');

  /* B2: مدیرِ ۲ روی مدرسهٔ ۱ → out_of_scope */
  const evil = await http('POST', '/api/sync', { ops: [opX({ by: mgr2.id, collection: 'summer_classes', type: 'ins', data: mk(1, { name: 'تجاوز' }) })] }, mgr2C);
  T(evil.status === 403 && evil.json && evil.json.code === 'out_of_scope', 'B2 مدیرِ ۲ روی مدرسهٔ ۱ → out_of_scope (گرفت: ' + evil.status + ' ' + (evil.json && evil.json.code) + ')');

  /* B3: دبیرِ ۱ ins → role_denied */
  const tins = await http('POST', '/api/sync', { ops: [opX({ by: tea1.id, collection: 'summer_classes', type: 'ins', data: mk(1, { name: 'دبیر' }) })] }, tea1C);
  /* R96: رد per-op از fieldGate یا ردِ دامنه‌ای (out_of_scope) — هر دو fail-closed */
  const tinsS = tins.json && tins.json.results && tins.json.results[0];
  T((tins.status === 403 && tins.json && ['role_denied', 'out_of_scope'].includes(tins.json.code)) || (tins.status === 200 && tinsS && !tinsS.ok && ['role_denied', 'out_of_scope'].includes(tinsS.code)), 'B3 دبیر: ins → رد (گرفت: ' + tins.status + ' ' + (tins.json && (tins.json.code || (tinsS && tinsS.code))) + ')');

  /* B4: فلش → رکورد در store */
  await sleep(2300);
  let st = JSON.parse(fs.readFileSync(store, 'utf8'));
  let row = (st.summer_classes || []).find((r) => r.name === 'تست تابستان');
  T(!!row, 'B4 رکوردِ ساخته‌شده در store است');
  const rid = row ? row.id : 0;

  /* B5: مدیرِ ۱ upd دانش‌آموزان */
  const upd = await http('POST', '/api/sync', { ops: [opX({ by: mgr1.id, collection: 'summer_classes', type: 'upd', id: rid, data: { student_ids: [st1.id], updated_at: '2026-06-10' } })] }, mgr1C);
  T(upd.status === 200, 'B5 مدیرِ ۱: upd دانش‌آموزان → 200');
  await sleep(2300);
  st = JSON.parse(fs.readFileSync(store, 'utf8'));
  row = (st.summer_classes || []).find((r) => r.id === rid);
  T(row && Array.isArray(row.student_ids) && row.student_ids.length === 1, 'B6 فلش: دانش‌آموزان در store است');

  /* B7: رکوردهای مسدودشده در store نیستند */
  T(!(st.summer_classes || []).some((r) => r.name === 'تجاوز'), 'B7 رکوردِ out_of_scope در store نیست');
  T(!(st.summer_classes || []).some((r) => r.name === 'دبیر'), 'B7b رکوردِ دبیر در store نیست');
} finally {
  child.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nsummer3 (سرور): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
