#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   teacher-eval-server.js — بند ب.۳: ارزشیابی ناشناس (سمت سرور)
   ───────────────────────────────────────────────────────────────────
   S1  درجِ دانش‌آموز اعمال می‌شود و رکوردِ سرور هیچ فیلد هویتی ندارد
   S2  درجِ ولی اعمال می‌شود
   S3  معلم و مدیر رد می‌شوند (role_denied)
   S4  فیلد هویتیِ تزریق‌شده (created_by) در دروازهٔ فیلد رد می‌شود
   S5  ویرایش و حذف برای همه رد می‌شود (مدل: upd=[]، del=[])
   S6  در ممیزیِ سرور رویدادی از نویسندهٔ موفق ثبت نمی‌شود
   اجرا:  node tests/teacher-eval-server.js   (پورت 9031)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const PORT = 9031;

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tmp = null, server = null;
process.on('exit', () => { try { if (server) server.kill('SIGKILL'); } catch (e) {} try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

/* F-CSRF-01: نگهبانِ مرکزیِ CSRF سرور، جهش‌های احراز‌شده را بدونِ
   X-CSRF-Token رد می‌کند. تست هم مثلِ مرورگر عمل می‌کند: کوکیِ csrf_token
   را از شیشهٔ کوکی می‌خواند و در سرآیند بازمی‌گرداند (double-submit). */
const csrfHdr = (c) => { const m = /(?:^|;\s*)csrf_token=([^;]+)/.exec(String(c || '')); return m ? { 'X-CSRF-Token': m[1] } : {}; };
const jarOf = (h) => (Array.isArray(h) ? h.join(', ') : String(h || ''))
  .split(/,(?=\s*[A-Za-z0-9_!#$%&'*+\-.^`|~]+=)/)
  .map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
function httpReq(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        cookie ? Object.assign({ Cookie: cookie }, csrfHdr(cookie)) : {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: b, json: j });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, body: '', json: null }));
    if (data) req.write(data);
    req.end();
  });
}

const IDENTITY_KEYS = ['created_by','author','author_id','user_id','student_id','parent_id',
  'respondent','respondent_id','by','national_id','phone','username','full_name'];

async function main() {
  if (!fs.existsSync(REAL_STORE)) { console.log('⏭️  server/data/payesh.json نیست — ابتدا: node server/seed.js'); process.exit(1); }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-teval-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(REAL_STORE, storeFile);
  const auditFile = path.join(tmp, 'audit.log');

  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile,
    PAYESH_KEY: path.join(tmp, 'jwt.key'), PAYESH_DEMO_CODE: '1'
  });
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'pipe' });
  let booted = false;
  for (let i = 0; i < 50; i++) {
    const h = await httpReq('GET', '/api/health');
    if (h.status === 200 && h.json && h.json.ok) {
      if (h.json.pid === server.pid) { booted = true; break; }
      try { process.kill(h.json.pid); } catch (e) {}
    }
    if (server.exitCode !== null) break;
    await sleep(300);
  }
  chk('S0 سرور بالا آمد (' + PORT + ')', booted);
  if (!booted) { console.log('جمع: 0 موفق، 1 ناموفق'); process.exit(1); }

  const seed = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const st = seed.users.find(u => u.role === 'student');
  const pa = seed.users.find(u => u.role === 'parent' && seed.parent_links.some(l => l.parent_id === u.id));
  const te = seed.users.find(u => u.role === 'teacher');
  const mg = seed.users.find(u => u.role === 'manager');
  const target = seed.users.find(u => u.role === 'teacher' && u.school_id === st.school_id);

  async function login(u) {
    const phone = String(u.phone).replace(/[\s\-()]/g, '');
    const sc = await httpReq('POST', '/api/auth/send-code', { phone });
    const code = sc.json && sc.json.demo_code;
    const lg = await httpReq('POST', '/api/auth/login', { phone, code, national_id: u.national_id });
    if (!(lg.json && lg.json.ok)) return null;
    const sc2 = lg.headers['set-cookie'];
    return jarOf(sc2);
  }
  const C = { st: await login(st), pa: await login(pa), te: await login(te), mg: await login(mg) };
  chk('S0b نشست‌ها (دانش‌آموز/ولی/معلم/مدیر)', Object.values(C).every(Boolean));

  let seq = 0;
  async function syncOps(ck, ops) {
    return httpReq('POST', '/api/sync', { ops: ops.map(o => Object.assign({ uid: 'teval-' + (++seq) }, o)) }, ck);
  }
  const res0 = (r) => (r.json && r.json.results && r.json.results[0]) || {};

  console.log('\n— ب.۳ سمت سرور —');

  /* S1 */
  const evData = { school_id: st.school_id, teacher_id: target.id,
    criteria: { mastery: 5, behavior: 4, discipline: 5, feedback: 4, fairness: 5 },
    feedback: 'درس را روشن توضیح می‌دهد', created_at: new Date().toISOString().slice(0, 10) };
  const r1 = await syncOps(C.st, [{ t: 'ins', c: 'teacher_evaluations', by: st.id, data: evData }]);
  chk('S1 درج دانش‌آموز پذیرفته شد', res0(r1).ok === true, JSON.stringify(res0(r1)));
  await sleep(2300); /* persist هر ۲ ثانیه */
  const store1 = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const mine = (store1.teacher_evaluations || []).filter(e => e.feedback === evData.feedback);
  chk('S1b رکورد در ذخیره‌گاه است', mine.length === 1);
  if (mine.length === 1) {
    const keys = Object.keys(mine[0]);
    chk('S1c رکورد سرور هیچ فیلد هویتی ندارد', IDENTITY_KEYS.every(k => keys.indexOf(k) < 0), keys.join(','));
    chk('S1d معیارها سالم رسید', mine[0].criteria && mine[0].criteria.mastery === 5);
  }

  /* S2 */
  const kidSchool = ((seed.parent_links.find(l => l.parent_id === pa.id) || {}));
  const kid = seed.users.find(u => u.id === kidSchool.student_id);
  const t2 = seed.users.find(u => u.role === 'teacher' && u.school_id === (kid || {}).school_id);
  const r2 = await syncOps(C.pa, [{ t: 'ins', c: 'teacher_evaluations', by: pa.id,
    data: { school_id: (kid || {}).school_id, teacher_id: (t2 || {}).id,
      criteria: { mastery: 3, behavior: 3, discipline: 3, feedback: 3, fairness: 3 },
      feedback: '', created_at: new Date().toISOString().slice(0, 10) } }]);
  chk('S2 درج ولی پذیرفته شد', res0(r2).ok === true, JSON.stringify(res0(r2)));

  /* S3 — معلم و مدیر اجازهٔ درج ندارند (دروازهٔ نقش یا دامنه) */
  const DENY = ['role_denied', 'out_of_scope'];
  const r3a = await syncOps(C.te, [{ t: 'ins', c: 'teacher_evaluations', by: te.id, data: evData }]);
  chk('S3a درج معلم رد شد', DENY.indexOf(res0(r3a).code) > -1, JSON.stringify(res0(r3a)));
  const r3b = await syncOps(C.mg, [{ t: 'ins', c: 'teacher_evaluations', by: mg.id, data: evData }]);
  chk('S3b درج مدیر رد شد', DENY.indexOf(res0(r3b).code) > -1, JSON.stringify(res0(r3b)));

  /* S4 — تزریق فیلد هویتی */
  const forged = Object.assign({}, evData, { created_by: st.id });
  const r4 = await syncOps(C.st, [{ t: 'ins', c: 'teacher_evaluations', by: st.id, data: forged }]);
  chk('S4 فیلد هویتی تزریق‌شده رد شد', res0(r4).ok !== true && /field/i.test(res0(r4).code || ''), JSON.stringify(res0(r4)));

  /* S5 — ویرایش/حذف بسته */
  await sleep(2300);
  const any = ((JSON.parse(fs.readFileSync(storeFile, 'utf8'))).teacher_evaluations || [])[0];
  if (any) {
    const r5a = await syncOps(C.st, [{ t: 'upd', c: 'teacher_evaluations', id: any.id, by: st.id, data: { feedback: 'x' } }]);
    chk('S5a ویرایش رد شد (مدل بدون upd)', DENY.indexOf(res0(r5a).code) > -1, JSON.stringify(res0(r5a)));
    const r5b = await syncOps(C.mg, [{ t: 'del', c: 'teacher_evaluations', id: any.id, by: mg.id }]);
    chk('S5b حذف رد شد (مدل بدون del)', DENY.indexOf(res0(r5b).code) > -1, JSON.stringify(res0(r5b)));
  }

  /* S6 — ممیزی: نویسندهٔ موفق ثبت نمی‌شود */
  server.kill('SIGTERM');
  await sleep(700);
  let auditTxt = '';
  try { auditTxt = fs.readFileSync(auditFile, 'utf8'); } catch (e) {}
  const successLines = auditTxt.split('\n').filter(l => l.indexOf('teacher_evaluations') > -1
    && l.indexOf('denied') < 0 && l.indexOf('failed') < 0 && l.indexOf('gate') < 0);
  chk('S6 در ممیزی رویداد موفقِ دارای هویت نیست', successLines.length === 0, successLines.slice(0, 2).join(' | '));

  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`ب.۳ سرور: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
