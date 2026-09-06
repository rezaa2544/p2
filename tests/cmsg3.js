#!/usr/bin/env node
/**
 * تستِ سرور: دسترسی‌های مسیرِ دوازدهم↔مشاور (بند ۵.۲)
 *  - دانش‌آموز: فقط رشتهٔ خودش (ins برای خودت؛ برای دیگری out_of_scope)
 *  - ولی: فقط فرزندش
 *  - مشاور: فقط مدرسهٔ خودش
 *  - دبیر و مدیر: role_denied (مسیرِ نوشتن برای آن‌ها نیست)
 *  - رکوردهای مسدودشده در store نمی‌مانند
 *
 * اجرا:  node tests/cmsg3.js   (پورت 8999)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { opX } = require('./helpers/opx');

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

async function main() {
console.log('\n▸ سرور: دسترسی‌های counselor_msgs (بند ۵.۲)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-cmsg-'));
const store = path.join(dir, 'store.json');
const seed = path.join(ROOT, 'server/data/payesh.json');
if (!fs.existsSync(seed)) { console.error('⚠️ server/data/payesh.json نیست — اول: node server/seed.js'); process.exit(1); }
fs.copyFileSync(seed, store);
const child = spawn('node', [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PAYESH_STORE: store, PAYESH_AUDIT: path.join(dir, 'audit.jsonl'), PAYESH_JWT_SECRET: 'cmsg-test-secret', PAYESH_DEMO_CODE: '1' },
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
  const cls12 = (store0.classes || []).find((c) => String(c.name).indexOf('دوازدهم') === 0);
  const enr = (store0.enrollments || []).find((e) => e.class_id === cls12.id);
  const stU = store0.users.find((u) => u.id === enr.student_id);
  const st2 = store0.users.find((u) => u.role === 'student' && u.school_id === stU.school_id && u.id !== stU.id);
  const parL = (store0.parent_links || []).find((p) => p.student_id === stU.id);
  const parU = parL ? store0.users.find((u) => u.id === parL.parent_id) : null;
  const par2 = store0.users.find((u) => u.role === 'parent' && !(store0.parent_links || []).some((p) => p.parent_id === u.id && p.student_id === stU.id));
  const cou1 = store0.users.find((u) => u.role === 'counselor' && u.school_id === stU.school_id);
  const cou2 = store0.users.find((u) => u.role === 'counselor' && u.school_id !== stU.school_id);
  const teaU = store0.users.find((u) => u.role === 'teacher' && u.school_id === stU.school_id);
  const mgrU = store0.users.find((u) => u.role === 'manager' && u.school_id === stU.school_id);
  if (!stU || !parU || !cou1 || !teaU || !mgrU) { console.error('  ❌ زمینهٔ دمو پیدا نشد', { stU: !!stU, parU: !!parU, cou1: !!cou1 }); process.exit(1); }

  const login = async (u) => {
    const sc = await http('POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json.demo_code || sc.json.code || '000000';
    const lg = await http('POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    return lg.hdr.split(';')[0];
  };
  const stC = await login(stU);
  const parC = await login(parU);
  const par2C = await login(par2);
  const cou1C = await login(cou1);
  const cou2C = await login(cou2);
  const teaC = await login(teaU);
  const mgrC = await login(mgrU);
  const msg = (extra) => Object.assign({ school_id: stU.school_id, student_id: stU.id, author_role: 'student', status: 'open', created_at: '2026-09-06' }, extra || {});

  /* S1: دانش‌آموز برای خودش */
  const s1 = await http('POST', '/api/sync', { ops: [opX({ by: stU.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: stU.id, body: 'پیامِ تستِ سرور — دوازدهم' }) })] }, stC);
  T(s1.status === 200, 'S1 دانش‌آموز: ins رشتهٔ خودش → 200 (گرفت: ' + s1.status + ' ' + JSON.stringify(s1.json).slice(0, 120) + ')');

  /* S2: دانش‌آموز برای دانش‌آموزِ دیگر */
  const s2 = await http('POST', '/api/sync', { ops: [opX({ by: stU.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: stU.id, student_id: st2.id, body: 'تجاوز دانش‌آموزی' }) })] }, stC);
  T(s2.status === 403 && s2.json.code === 'out_of_scope', 'S2 دانش‌آموز برای دانش‌آموزِ دیگر → out_of_scope (گرفت: ' + s2.status + ' ' + s2.json.code + ')');

  /* S3: ولی برای فرزندش */
  const s3 = await http('POST', '/api/sync', { ops: [opX({ by: parU.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: parU.id, author_role: 'parent', body: 'پیامِ ولیِ واقعی' }) })] }, parC);
  T(s3.status === 200, 'S3 ولی: ins برای فرزندش → 200 (گرفت: ' + s3.status + ' ' + JSON.stringify(s3.json).slice(0, 120) + ')');

  /* S4: ولیِ بیگانه */
  const s4 = await http('POST', '/api/sync', { ops: [opX({ by: par2.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: par2.id, author_role: 'parent', body: 'تجاوز ولیِ بیگانه' }) })] }, par2C);
  T(s4.status === 403 && s4.json.code === 'out_of_scope', 'S4 ولیِ بیگانه → out_of_scope (گرفت: ' + s4.status + ' ' + s4.json.code + ')');

  /* S5: مشاورِ مدرسهٔ خودش پاسخ */
  const s5 = await http('POST', '/api/sync', { ops: [opX({ by: cou1.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: cou1.id, author_role: 'counselor', body: 'پاسخِ مشاور' }) })] }, cou1C);
  T(s5.status === 200, 'S5 مشاور: پاسخ → 200 (گرفت: ' + s5.status + ' ' + JSON.stringify(s5.json).slice(0, 120) + ')');

  /* S6: مشاورِ مدرسهٔ دیگر */
  const s6 = await http('POST', '/api/sync', { ops: [opX({ by: cou2.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: cou2.id, author_role: 'counselor', body: 'تجاوز بین‌مدرسه‌ای' }) })] }, cou2C);
  T(s6.status === 403 && s6.json.code === 'out_of_scope', 'S6 مشاورِ مدرسهٔ دیگر → out_of_scope (گرفت: ' + s6.status + ' ' + s6.json.code + ')');

  /* S7: دبیر */
  const s7 = await http('POST', '/api/sync', { ops: [opX({ by: teaU.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: teaU.id, author_role: 'teacher', body: 'دبیر' }) })] }, teaC);
  T(s7.status === 403 && s7.json.code === 'role_denied', 'S7 دبیر → role_denied (گرفت: ' + s7.status + ' ' + s7.json.code + ')');

  /* S8: مدیر (مسیرِ نوشتن برای مدیر نیست) */
  const s8 = await http('POST', '/api/sync', { ops: [opX({ by: mgrU.id, collection: 'counselor_msgs', type: 'ins', data: msg({ author_id: mgrU.id, author_role: 'manager', body: 'مدیر' }) })] }, mgrC);
  T(s8.status === 403 && s8.json.code === 'role_denied', 'S8 مدیر → role_denied (گرفت: ' + s8.status + ' ' + s8.json.code + ')');

  /* S9: فلش — فقط رکوردهای مجاز در store */
  await sleep(2300);
  const st = JSON.parse(fs.readFileSync(store, 'utf8'));
  const mine = ['پیامِ تستِ سرور — دوازدهم', 'پیامِ ولیِ واقعی', 'پاسخِ مشاور'];
  const rows = (st.counselor_msgs || []).filter((r) => mine.indexOf(r.body) > -1);
  T(rows.length === 3, 'S9 رکوردهای مجاز در store (3): ' + rows.length);
  T(!(st.counselor_msgs || []).some((r) => String(r.body).indexOf('تجاوز') > -1), 'S9b رکوردهای مسدودشده در store نیستند');
  T(!(st.counselor_msgs || []).some((r) => String(r.body).indexOf('دبیر') === 0 || String(r.body).indexOf('مدیر') === 0), 'S9c رکوردِ نقش‌های ردشده در store نیستند');
} finally {
  child.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\ncmsg3 (سرور): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
