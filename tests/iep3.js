#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   IEP سمتِ سرور (بند ۲.۲ — استثنأ محدوده‌دار fail-closed روی users)
     B1  دبیر: آپدیتِ users فقط با فیلدهای IEP → 200 + اعمال روی store
     B2  دبیر: آپدیتِ users با فیلدِ غیر-IEP (full_name) → role_denied
     B3  دبیر: insert روی users → role_denied
     B4  store: یادداشت IEP اعمال شد؛ full_name دست‌نخورده
   اجرا: node tests/iep3.js
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
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, raw: b, headers: res.headers }); });
    });
    req.on('error', () => resolve({ status: 0, json: null, raw: '', headers: {} }));
    if (data) req.write(data);
    req.end();
  });
}
function cookieOf(h) {
  const sc = h['set-cookie'];
  if (!sc) return '';
  const pair = sc[0].split(';')[0];
  return pair;
}

async function bootServer(p, env) {
  const s = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'pipe' });
  let booted = false;
  for (let i = 0; i < 50; i++) {
    const h = await httpReq(p, 'GET', '/api/health').then((r) => r.json).catch(() => null);
    if (h && h.ok) { booted = true; break; }
    await sleep(300);
  }
  if (!booted) s.kill('SIGKILL');
  return booted ? s : null;
}

async function main() {
  console.log('\n▸ IEP سمتِ سرور (بند ۲.۲)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-iep3-'));
  process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
  const storeFile = path.join(tmp, 'payesh.json');
  const seed = path.join(ROOT, 'server/data/payesh.json');
  if (!fs.existsSync(seed)) { console.log('  ❌ seed نیست: node server/seed.js'); process.exit(1); }
  fs.copyFileSync(seed, storeFile);
  const st0 = JSON.parse(fs.readFileSync(storeFile, 'utf8'));

  /* یک دبیر + دانش‌آموزی که در کلاسی او درس می‌خواند */
  const t = st0.users.find(u => u.role === 'teacher' && u.school_id === 1 && u.active);
  const sched = (st0.schedule || []).find(x => x.teacher_id === t.id);
  const st = st0.enrollments.find(e => e.class_id === sched.class_id)
    ? st0.users.find(u => u.role === 'student' && st0.enrollments.some(e => e.class_id === sched.class_id && e.student_id === u.id))
    : null;
  if (!t || !st) { console.log('  ❌ زمینهٔ دمو (دبیر+دانش‌آموز) پیدا نشد'); process.exit(1); }
  const origName = st.full_name;

  const srv = await bootServer(8998, {
    PORT: '8998', HOST: '127.0.0.1',
    PAYESH_STORE: storeFile, PAYESH_AUDIT: path.join(tmp, 'audit.log'),
    PAYESH_KEY: path.join(tmp, 'jwt.key'), PAYESH_DEMO_CODE: '1'
  });
  chk('B0 سرور بالا آمد', srv !== null);
  if (!srv) process.exit(1);

  /* ورودِ دبیر (کدِ دمو بازتاب می‌شود) */
  const sc = await httpReq(8998, 'POST', '/api/auth/send-code', { phone: t.phone });
  const code = sc.json && (sc.json.demo_code || sc.json.code);
  const lg = await httpReq(8998, 'POST', '/api/auth/login', { phone: t.phone, code, national_id: t.national_id });
  const cookie = cookieOf(lg.headers);
  chk('B1 ورودِ دبیر', lg.status === 200 && !!cookie, lg.raw.slice(0, 120));

  /* B2 — آپدیتِ IEP-only: باید بگذرد */
  const NOW=new Date().toISOString();
  const op1 = { uid: 'iep3-' + Date.now() + '-1', by: t.id, at: NOW, c: 'users', t: 'upd', id: st.id,
                data: { iep_notes: 'یادداشتِ سمتِ سرور', iep_staff: 'مشاور (تست)', iep_updated: new Date().toISOString().slice(0, 10) } };
  const r1 = await httpReq(8998, 'POST', '/api/sync', { ops: [op1] }, cookie);
  const ok1 = r1.status === 200 && r1.json && r1.json.results && r1.json.results[0] && r1.json.results[0].ok;
  chk('B2 آپدیتِ IEP-only توسطِ دبیر = 200', ok1, r1.raw.slice(0, 140));

  /* B3 — آپدیت با فیلدِ غیر-IEP: role_denied */
  const op2 = { uid: 'iep3-' + Date.now() + '-2', by: t.id, at: NOW, c: 'users', t: 'upd', id: st.id, data: { full_name: 'هکر' } };
  const r2 = await httpReq(8998, 'POST', '/api/sync', { ops: [op2] }, cookie);
  /* R96: ردِّ نقش per-op از fieldGate (200 + ok:false) — legacy 403 دسته‌ای منسوخ */
  const s2b3 = r2.json && r2.json.results && r2.json.results[0];
  chk('B3 آپدیتِ full_name توسطِ دبیر = role_denied', (r2.status === 403 && r2.json && r2.json.code === 'role_denied') || (r2.status === 200 && s2b3 && !s2b3.ok && s2b3.code === 'role_denied'), r2.raw.slice(0, 120));

  /* B4 — insert روی users: role_denied */
  const op3 = { uid: 'iep3-' + Date.now() + '-3', by: t.id, at: NOW, c: 'users', t: 'ins', id: null, data: { full_name: 'کاربرِ کاذب', role: 'manager', school_id: 1, active: 1 } };
  const r3 = await httpReq(8998, 'POST', '/api/sync', { ops: [op3] }, cookie);
  /* R96: دروازهٔ درون‌دوزی (inScope) پیش از fieldGate شلیک می‌کند → out_of_scope */
  const s3b4 = r3.json && r3.json.results && r3.json.results[0];
  chk('B4 insert روی users توسطِ دبیر = رد', (r3.status === 403 && r3.json && ['role_denied', 'out_of_scope'].includes(r3.json.code)) || (r3.status === 200 && s3b4 && !s3b4.ok), r3.raw.slice(0, 120));

  /* B5 — store: IEP اعمال شد، full_name دست‌نخورده
     (سرور هر ۲ ثانیه flush می‌کند — صبر تا flush) */
  await sleep(2300);
  const st1 = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const stNow = st1.users.find(u => u.id === st.id);
  chk('B5a یادداشتِ IEP روی store اعمال شد', stNow && stNow.iep_notes === 'یادداشتِ سمتِ سرور', JSON.stringify(stNow && stNow.iep_notes));
  chk('B5b full_name دست‌نخورده است', stNow.full_name === origName, stNow.full_name);
  const usersCount = st1.users.length;
  chk('B5c کاربرِ کاذب ساخته نشده', usersCount === st0.users.length, usersCount);

  srv.kill('SIGKILL');
  console.log('\n────────────────────────────────────────────────────');
  console.log(`iep3 (IEP سرور): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
