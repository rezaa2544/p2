#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۶ — ترک تحصیل: تست‌های موتانت
   ───────────────────────────────────────────────────────────────────
   هر موتانت باید «کشته» شود: یعنی روی کدِ واقعی چک برقرار باشد و
   با اعمالِ موتانت از بین برود.
   M1 کلاینت: حذفِ گاردِ «سایر بدون توضیح»
   M2 کلاینت: بازگشت، سابقهٔ ترک را پاک کند (نباید بماند؟ بله باید بماند)
   M3 کلاینت: جنسیتِ آمار همیشه «پسر» باشد
   M4 کلاینت: گاردِ «فارغ‌التحصیل» از ثبتِ ترک حذف شود
   M5 سرور: درِ سفیدِ کلیدها خاموش شود (کلیدِ اضافی رد نشود)
   M6 سرور: دامنه‌بندیِ مدیر (مدرسهٔ خودش) خاموش شود
   اجرا: node tests/dropout-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 180) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────── موتانت‌هایِ کلاینت (بیلدِ index.html) ─────────── */
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️ jsdom نیست — کلاینت رد شد'); }

async function clientMutated(mutName, htmlMutate, probe) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mutated = htmlMutate(html);
  const vc = new VirtualConsole();
  const dom = new JSDOM(mutated, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc
  });
  const win = dom.window;
  await sleep(450);
  return probe(win.eval);
}

/** اجرایِ probe روی یک بیلد (real یا mutated) — probe باید رویِ کدِ واقعی
    true بدهد؛ اگر رویِ کدِ mutated هم true بدهد، موتانت زنده‌مانده است. */
async function runClientOn(html, probe) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc
  });
  const win = dom.window;
  await sleep(450);
  const ok = await probe(win.eval);
  win.close();
  return ok;
}
const REAL_HTML = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* دانش‌آموزِ فعالِ اولینِ مدرسهٔ فعالِ داده‌شده (schoolIdx = ۰-based) */
const studentOf = (W, schoolIdx) => W(`(function(){
  var s=db.schools.filter(function(x){return x.active;})[${schoolIdx}];
  var cls=db.classes.filter(function(c){return c.school_id===s.id;})[0];
  var e=db.enrollments.filter(function(x){return x.class_id===cls.id;})[0];
  var u=byId('users',e.student_id);
  if((u.status||'active')==='dropped_out'){u.status='active';u.active=1;}
  return u.id;
})()`);

async function runMut(name, mutateHtml, probe) {
  const real = await runClientOn(REAL_HTML(), probe);
  if (!real) { fail++; console.log('  ❌ ' + name + ' — سینیتی شکست: چک رویِ کدِ واقعی true نیست'); return; }
  const mutated = mutateHtml(REAL_HTML());
  const mut = await runClientOn(mutated, probe);
  if (mut) { fail++; console.log('  ❌ ' + name + ' — موتانت زنده‌مانده است (تست‌ها پیدایش نکردند!)'); }
  else { pass++; console.log('  ✅ ' + name + ' — کشته شد'); }
}

async function clientMutations() {
  if (!JSDOM) return;
  console.log('\n▸ موتانت‌هایِ کلاینت (سینیتی روی کدِ واقعی + کشتن رویِ کدِ mutated)');

  /* M1: گاردِ «سایر بدون توضیح» حذف شود */
  await runMut('M1 «سایر» بدون توضیح', (h) => {
    const guard = "if(reason === 'other' && !(note || '').trim()) return { ok: false, msg: 'برای «سایر»، توضیحِ آزاد الزامی است' };";
    if (h.indexOf(guard) < 0) throw new Error('گارد پیدا نشد');
    return h.replace(guard, '/* MUT M1 */');
  }, async (W) => {
    const st = Number(studentOf(W, 0));
    const r = W(`dropRegister(${st},'2026-09-01','other','')`);
    return r.ok === false && W(`(byId('users',${st}).status||'active')==='active'`);
  });

  /* M2: بازگشت، سابقهٔ ترک را پاک کند */
  await runMut('M2 بازگشت سابقهٔ ترک را می‌سازد', (h) => {
    const a = "status: 'active',\n    active: 1,\n    returned_at: date,\n    returned_by:";
    if (h.indexOf(a) < 0) throw new Error('dropReturn پیدا نشد');
    return h.replace(a, "status: 'active',\n    active: 1,\n    returned_at: date,\n    dropped_out_reason: null,\n    dropped_out_at: null,\n    dropped_out_by: null,\n    returned_by:");
  }, async (W) => {
    const st = Number(studentOf(W, 0));
    W(`dropRegister(${st},'2026-09-01','economic','مستند')`);
    W(`dropReturn(${st},'2026-09-05')`);
    return W(`(function(){
      var u=byId('users',${st});
      return u.status==='active' && u.returned_at==='2026-09-05'
        && u.dropped_out_reason==='economic' && u.dropped_out_at==='2026-09-01';
    })()`);
  });

  /* M3: جنسیتِ آمار همیشه «پسر» */
  await runMut('M3 جنسیت از مدرسه محاسبه می‌شود', (h) => {
    const a = "var gender = (sc && sc.gender === 'دخترانه') ? 'دختر' : 'پسر';";
    if (h.indexOf(a) < 0) throw new Error('خطِ جنسیت پیدا نشد');
    return h.replace(a, "var gender = 'پسر';");
  }, async (W) => {
    const a = Number(studentOf(W, 0)); /* مدرسهٔ ۰ = پسرانه */
    const b = Number(studentOf(W, 1)); /* مدرسهٔ ۱ = دخترانه */
    return W(`(function(){
      var s1=db.schools.filter(function(x){return x.active;})[0];
      var s2=db.schools.filter(function(x){return x.active;})[1];
      dropRegister(${a},'2026-09-01','economic');
      dropRegister(${b},'2026-09-02','health');
      var ds=dropStats([s1.id,s2.id]);
      dropReturn(${a},'2026-09-03');dropReturn(${b},'2026-09-03');
      return (ds.byGender['پسر']||0)===1 && (ds.byGender['دختر']||0)===1;
    })()`);
  });

  /* M4: گاردِ «فارغ‌التحصیل» حذف شود */
  await runMut('M4 ثبتِ ترک برایِ فارغ‌التحصیل مسدود است', (h) => {
    const a = "if((u.status || 'active') === 'graduated') return { ok: false, msg: 'دانش‌آموز فارغ‌التحصیل است' };";
    if (h.indexOf(a) < 0) throw new Error('گاردِ فارغ‌التحصیل پیدا نشد');
    return h.replace(a, '/* MUT M4 */');
  }, async (W) => {
    const st = Number(studentOf(W, 0));
    W(`byId('users',${st}).status='graduated'`);
    const r = W(`dropRegister(${st},'2026-09-01','other','تست')`);
    W(`byId('users',${st}).status='active'`);
    return r.ok === false;
  });
}

/* ─────────── موتانت‌هایِ سرور (سرورِ واقعی با sync.jsِ تغییر‌داده‌شده) ─────────── */
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

async function serverMutated(mutName, mutateSync, probe) { /* mutateSync=null ⇒ سرورِ واقعی (سینیتی) */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-mut-'));
  const srvDir = path.join(tmp, 'server');
  fs.mkdirSync(srvDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'server'))) {
    if (f === 'data') continue;
    fs.copyFileSync(path.join(ROOT, 'server', f), path.join(srvDir, f));
  }
  /* R96: authz/model.json در ریشهٔ مخزن است — بدون آن requireِ sync.js شکست می‌خورد */
  fs.mkdirSync(path.join(tmp, 'authz'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'authz', 'model.json'), path.join(tmp, 'authz', 'model.json'));
  const syncFile = path.join(srvDir, 'sync.js');
  if (mutateSync) fs.writeFileSync(syncFile, mutateSync(fs.readFileSync(syncFile, 'utf8')));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);

  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const ST = src.users.find(u => u.role === 'student' && u.school_id === 1);
  const M1 = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  const M2 = src.users.find(u => u.role === 'manager' && u.school_id === 2);

  let port = null, srv = null;
  for (const p of [8997, 8996, 8998]) {
    const s = spawn(process.execPath, ['server/index.js'], {
      cwd: tmp,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: path.join(tmp, 'audit.log'), PAYESH_KEY: path.join(tmp, 'k.key'), PAYESH_DEMO_CODE: '1'
      }),
      stdio: 'pipe'
    });
    let booted = false;
    for (let i = 0; i < 40; i++) {
      const h = await httpReq(p, 'GET', '/api/health').then(r => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break;
      await sleep(250);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  if (port === null) throw new Error('سرورِ موتانت بالا نیامد (' + mutName + ')');

  async function login(u) {
    const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone: u.phone });
    const lg = await httpReq(port, 'POST', '/api/auth/login', { phone: u.phone, code: sc.json && sc.json.demo_code, national_id: u.national_id });
    return lg.json && lg.json.ok ? cookieFrom(lg) : null;
  }
  let seq = 0;
  async function syncOp(cookie, data, byId) {
    const r = await httpReq(port, 'POST', '/api/sync', { ops: [{ t: 'upd', c: 'users', id: ST.id, data, by: byId, uid: 'mut-' + (++seq) }] }, cookie);
    const s = r.json && r.json.results && r.json.results[0];
    return s || { ok: false, code: 'no-result' };
  }
  try {
    const cM1 = await login(M1);
    const cM2 = await login(M2);
    if (!cM1 || !cM2) throw new Error('ورودِ سرورِ موتانت شکست خورد');
    return await probe({ syncOp, ST, M1, M2, cM1, cM2 });
  } finally {
    srv.kill('SIGKILL');
  }
}

async function serverMutations() {
  console.log('\n▸ موتانت‌هایِ سرور (سرورِ واقعی)');

  /* M5: درِ سفیدِ کلیدها خاموش */
  try {
    const probe5 = async ({ syncOp, ST, M1, cM1 }) => {
      const s = await syncOp(cM1, { status: 'dropped_out', active: 0, dropped_out_at: '2026-09-01', dropped_out_reason: 'other', password: 'x' }, M1.id);
      return !s.ok && s.code === 'role_denied';
    };
    const mut5 = (h) => {
      const a = 'return keys.every(k => DROP_KEYS.indexOf(k) > -1);';
      if (h.indexOf(a) < 0) throw new Error('whitelist پیدا نشد');
      return h.replace(a, 'return true;');
    };
    const san5 = await serverMutated('M5-sanity', null, probe5);
    if (!san5) { fail++; console.log('  ❌ M5 — سینیتی شکست: چک رویِ سرورِ واقعی true نیست'); }
    else {
      const mut5ok = await serverMutated('M5', mut5, probe5);
      if (mut5ok) { fail++; console.log('  ❌ M5 — موتانت زنده‌مانده است (تست‌ها پیدایش نکردند!)'); }
      else { pass++; console.log('  ✅ M5 کلیدِ اضافی (password) با فیلدهایِ ترک — کشته شد'); }
    }
  } catch (e) { fail++; console.log('  ❌ M5 خطا: ' + e.message); }

  /* M6: دامنه‌بندیِ مدیر خاموش */
  try {
    const probe6 = async ({ syncOp, ST, M2, cM2 }) => {
      const s = await syncOp(cM2, { status: 'dropped_out', active: 0, dropped_out_at: '2026-09-01', dropped_out_reason: 'other' }, M2.id);
      return !s.ok && s.code === 'out_of_scope';
    };
    const mut6 = (h) => {
      const a = 'return s === u.school_id;';
      if (h.indexOf(a) < 0) throw new Error('inScope پیدا نشد');
      return h.replace(a, 'return true;');
    };
    const san6 = await serverMutated('M6-sanity', null, probe6);
    if (!san6) { fail++; console.log('  ❌ M6 — سینیتی شکست: چک رویِ سرورِ واقعی true نیست'); }
    else {
      const mut6ok = await serverMutated('M6', mut6, probe6);
      if (mut6ok) { fail++; console.log('  ❌ M6 — موتانت زنده‌مانده است (تست‌ها پیدایش نکردند!)'); }
      else { pass++; console.log('  ✅ M6 مدیرِ مدرسهٔ دیگر fail-closed می‌ماند — کشته شد'); }
    }
  } catch (e) { fail++; console.log('  ❌ M6 خطا: ' + e.message); }
}


async function main() {
  await clientMutations();
  await serverMutations();
  console.log('\n' + '─'.repeat(52));
  console.log(`موتانت‌هایِ ترک تحصیل: ${pass}/${pass + fail} کشته شد` + (fail ? `  —  ${fail} زنده‌مانده!` : '  —  همهٔ موتانت کشته شدند ✅'));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
