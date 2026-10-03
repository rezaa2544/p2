#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   M14-A01 reproduction — sync/report_logs tenant isolation (P1 claim)
   ───────────────────────────────────────────────────────────────────
   Claim under test (from prior independent verification):
     Teacher → POST /api/sync {ops:[{c:'report_logs', t:'ins', ...}]}
       → currently HTTP 200, expected HTTP 403.

   This suite does NOT assume the claim is the final truth. It boots a
   real server on current HEAD, logs in as several actors, and records:
     - the HTTP status
     - the per-op verdict inside the body (ok / code)
     - whether the record was ACTUALLY written to the store
   The write check is the load-bearing signal: an HTTP 200 whose body
   says ok:false and whose record never landed is the documented batch
   contract, not a bypass. A 200 whose record landed IS a bypass.

   Mutation: A01_MUTATE=VULN rewrites the role gate to a wildcard so the
   op is accepted; the write check must then turn RED (negative proof).
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const PORT = 8971;

/* ── mutation harness (A01_MUTATE) ───────────────────────────────
   VULN: the role gate inside fieldGate is rewritten so the canOp check
   is short-circuited. With the vulnerable gate the teacher op must
   PASS fieldGate (returns null) — proving the gate is load-bearing.
   If fieldGate still denies under VULN, the negative proof is dead.

   The mutation is exercised at unit level because the running server
   always requires the pristine server/sync.js; a file-level mutation
   could never reach the booted server without editing committed
   source (which this harness must never do). fieldGate is a module
   export (sync.js line ~1415), so a mutated copy can be required
   directly with the same function shape. */
const MUT = process.env.A01_MUTATE || '';
let SYNC_PATH = path.join(ROOT, 'server', 'sync.js');
let mutatedFile = null;
if (MUT) {
  const p = path.resolve(ROOT, 'server', 'sync.a01-mutated.js');
  if (path.dirname(p) !== path.join(ROOT, 'server')) throw new Error('a01: mutated path escapes server/');
  const M = {
    VULN: [
      "  if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
      "  if(!exc && false && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
    ],
  };
  if (!M[MUT]) { console.error('جهش ناشناخته:', MUT); process.exit(2); }
  const live = fs.readFileSync(SYNC_PATH, 'utf8');
  if (live.split(M[MUT][0]).length - 1 !== 1) { console.error('الگوی جهش مچ نشد:', MUT); process.exit(2); }
  fs.writeFileSync(p, live.replace(M[MUT][0], M[MUT][1]));
  mutatedFile = p;
  console.log('[mutated]', MUT, '→', 'sync.a01-mutated.js');
  process.on('exit', () => { try { fs.unlinkSync(p); } catch (_) {} });
  SYNC_PATH = p;
}

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 300) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 300) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
const tmpdirs = [];
const serverLogs = [];
/* الگویِ اثبات‌شدهٔ otp-ratelimit.js: spawn درونِ یک تابع با argv کاملاً literal */
function spawnServer(env) {
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  p.stdout.on('data', (d) => (p.log += d));
  p.stderr.on('data', (d) => (p.log += d));
  procs.push(p);
  return p;
}
function close(p) {
  serverLogs.push(p.log || '');
  try { p.kill('SIGKILL'); } catch (e) {}
}
process.on('exit', () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const d of tmpdirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
});

function req(method, p, body, headers) {
  return new Promise((resolve) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        headers || {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers, text: b });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, headers: {}, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

async function boot(extraEnv) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a01-'));
  tmpdirs.push(d);
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: path.join(d, 's.json'),
    PAYESH_AUDIT: path.join(d, 'a.log'),
    PAYESH_KEY: path.join(d, 'k.key'),
    PAYESH_DEMO_CODE: '1',
    PAYESH_OTP_PEPPER: 'a01-repro-pepper'
  }, extraEnv || {});
  fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
  const p = spawnServer(env);
  for (let i = 0; i < 60; i++) {
    const h = await req('GET', '/api/health');
    if (h.status === 200 && h.json && h.json.ok && h.json.pid === p.pid) return { proc: p, dir: d, env };
    if (p.exitCode !== null) { console.log('  server died:\n' + (p.log || '').slice(-600)); return null; }
    await sleep(300);
  }
  return null;
}

/* ── session helpers ───────────────────────────────────────────── */
async function login(phone, national_id) {
  const sc = await req('POST', '/api/auth/send-code', { phone });
  const code = sc.json && sc.json.demo_code;
  if (!code) return null;
  const lg = await req('POST', '/api/auth/login', { phone, code, national_id });
  if (lg.status !== 200 || !lg.json || !lg.json.ok) return null;
  const cookie = (lg.headers['set-cookie'] || [])[0];
  return { cookie: cookie ? cookie.split(';')[0] : '', user: lg.json.user };
}

function syncOp(cookie, ops) {
  return req('POST', '/api/sync', { ops }, cookie ? { Cookie: cookie } : {});
}

function mkReportLogOp(actor, uid, school_id) {
  /* شکلِ واقعیِ report_logs registration که کلاینت می‌فرستد */
  return {
    uid: uid,
    c: 'report_logs',
    t: 'ins',
    by: actor.id,
    user_id: actor.id,
    school_id: school_id != null ? school_id : actor.school_id,
    data: {
      school_id: school_id != null ? school_id : actor.school_id,
      kind: 'attendance',
      format: 'pdf',
      generated_by: String(actor.id),
      status: 'pending',
      meta: { note: 'a01 repro' }
    }
  };
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
  const users = seed.users || [];
  const find = (role, school_id) => users.find(u => u.role === role && u.active !== 0 && (school_id == null || u.school_id === school_id));

  const teacher = find('teacher', 1);
  const manager = find('manager', 1);
  const teacherOther = users.find(u => u.role === 'teacher' && u.active !== 0 && u.school_id !== 1);
  const student = find('student', 1);
  const parent = find('parent', 1);
  const superadmin = find('superadmin');
  const counselor = find('counselor', 1);
  const eduOffice = users.find(u => u.role === 'edu_office' && u.active !== 0);
  const otherSchool = teacherOther ? teacherOther.school_id : 2;

  if (!teacher || !manager || !superadmin) {
    console.log('❌ seed فاقد نقش‌های لازم است', !!teacher, !!manager, !!superadmin);
    process.exit(1);
  }

  console.log('— A01-0: بوت سرور روی current HEAD —');
  const srv = MUT ? null : await boot();
  chk('سرور روی پورت ' + PORT + ' بالا آمد', !!srv || !!MUT);
  if (!srv && !MUT) {
    /* تلهٔ false-green: return زودهنگام بدونِ این انتصاب، یک شکستِ بوت
       را به خروجِ ۰ (سبز) تبدیل می‌کند. هر مسیرِ خروج must exitCode را
       از فایلِ نتیجه بازتاب دهد. */
    console.log('────────────────────────────────────────────────────────');
    console.log('A01 reproduction: ' + pass + ' ✅ / ' + fail + ' ❌');
    for (const e of errors) console.log('   ✗ ' + e);
    process.exit(1);
  }
  const storePath = srv ? srv.env.PAYESH_STORE : null;

  if (MUT) {
    console.log('  ⏳ حالتِ جهش: سرور بوت نمی‌شود (سرور همیشه sync.js اصلی را require می‌کند)');
    console.log('     proof در سطحِ unit روی fieldGate اجرا می‌شود (A01-7)');
  }

  /* ── actors login ───────────────────────────────────────────── */
  console.log('— A01-1: ورود actorها —');
  const sessions = {};
  if (!MUT) {
  for (const [key, u] of [['teacher', teacher], ['manager', manager], ['teacherOther', teacherOther],
    ['student', student], ['parent', parent], ['superadmin', superadmin], ['counselor', counselor],
    ['eduOffice', eduOffice]]) {
    if (!u || !u.phone || !u.national_id) { console.log('  ⏭ ' + key + ' — ندارد (skip)'); continue; }
    const s = await login(u.phone, u.national_id);
    chk('ورودِ ' + key + ' (id=' + u.id + ', school=' + u.school_id + ')', !!s, s ? '' : 'login failed');
    sessions[key] = s;
  }
  } else { console.log('  ⏳ حالتِ جهش: ورودِ actorها skip شد'); }

  const countReportLogs = () => {
    try { const st = JSON.parse(fs.readFileSync(storePath, 'utf8')); return (st.report_logs || []).length; }
    catch (e) { return -1; }
  };
  /* سرور فایلِ store را روی تیکرِ دوره‌ای (۲ ثانیه — index.js:659) فلش
     می‌کند، نه همگامِ پس از هر درخواست. خواندنِ بلافاصله پس از sync
     بنابراین مسابقهٔ زمانی است و رکوردِ قانونی را از دست می‌دهد.
     waitForCount تا رسیدن به هدف نظرسنجی می‌کند (برای write-های منتظره)؛
     settleCount یک چرخهٔ کاملِ تیکر صبر می‌کند و سپس می‌شمارد (برای
     مواردی که نباید نوشته شوند). */
  async function waitForCount(target, timeoutMs) {
    const start = Date.now();
    let last = countReportLogs();
    while (Date.now() - start < timeoutMs) {
      if (last === target) return last;
      await sleep(200);
      last = countReportLogs();
    }
    return last;
  }
  const SETTLE_MS = 2600; /* ≥ یک چرخهٔ کاملِ تیکرِ persist */
  async function settleCount() { await sleep(SETTLE_MS); return countReportLogs(); }
  const before = countReportLogs();

  /* ── A01-2: مورد P1 اصلی — teacher → report_logs ins ─────── */
  console.log('— A01-2: موردِ P1 اصلی — teacher → report_logs registration —');
  if (!MUT) {
    /* کنترلِ مثبتِ زنده‌بودنِ write-check: یک actorِ مجاز اول یک رکورد
       می‌نویسد و باید در فایل دیده شود. بدون این کنترل، اگر persist
       غیرفعال باشد، چکِ «نوشته نشد» برای teacher کاذب سبز می‌شود
       (همان تلهٔ false-green). فقط پس از اثباتِ این که مسیرِ write
       زنده است، چکِ teacher معنا پیدا می‌کند. */
    const canaryB4 = countReportLogs();
    const cm = sessions.manager;
    if (cm) {
      const rc = await syncOp(cm.cookie, [mkReportLogOp(cm.user, 'a01-canary-persist')]);
      const rcRes = (rc.json && rc.json.results && rc.json.results[0]) || {};
      const cAfter = await waitForCount(canaryB4 + 1, 6000);
      chk('CANARY: manager write پذیرفته شد (ok=true)', rcRes.ok === true, JSON.stringify(rcRes).slice(0, 200));
      chk('CANARY: رکورد در store نوشته شد (مسیرِ write زنده است)', cAfter === canaryB4 + 1, 'b4=' + canaryB4 + ' after=' + cAfter);
    } else { chk('CANARY: نشستِ manager وجود داشت', false); }

    const s = sessions.teacher;
    const r = await syncOp(s.cookie, [mkReportLogOp(s.user, 'a01-teacher-1')]);
    console.log('  HTTP status  : ' + r.status);
    console.log('  body ok      : ' + (r.json && r.json.ok));
    console.log('  results      : ' + JSON.stringify((r.json && r.json.results) || []));
    const res0 = (r.json && r.json.results && r.json.results[0]) || {};
    chk('A02-style: پاسخ HTTP ثبت شد (هر وضعیتی)', r.status > 0);
    chk('teacher: op در results بازگشت (نه silent drop)', !!res0.uid || !!res0.code, JSON.stringify(res0).slice(0, 200));
    chk('teacher: op رد شد (ok=false یا غیرِ ۲۰۰ِ body-level)', res0.ok === false || r.json.ok === false, JSON.stringify(res0).slice(0, 200));
    chk('teacher: code رد پاسخ‌ داده شد', !!res0.code, res0.code || '');
    /* سیگنالِ بارگذارِ اصلی: آیا رکورد واقعاً نوشته شد؟ یک چرخهٔ کاملِ
       تیکر صبر می‌کنیم تا هر نوشتنِ به‌تعویق‌افتاده رس برسد. */
    const base = countReportLogs();
    const after = await settleCount();
    chk('teacher: رکورد در store نوشته نشد (مهم‌ترین سیگنال)', after === base,
      'base=' + base + ' after=' + after);
    console.log('  store report_logs: base=' + base + ' after=' + after);
    if (r.status === 200 && res0.ok === false) {
      console.log('  ℹ توضیح: HTTP 200 + per-op ok:false قراردادِ دستهٔ sync است (خطِ 1398 sync.js + 865).');
      console.log('     این یک bypass نیست — مگر اینکه رکورد نوشته شده باشد (چکِ بالا).');
    }
  } else { console.log('  ⏳ حالتِ جهش: skip شد'); }

  /* ── A01-3: actorهای مجاز — آیا مسیرِ مشروع حفظ می‌شود؟ ─── */
  console.log('— A01-3: actorهای مجاز (model: manager/counselor/edu_office/superadmin) —');
  if (!MUT) {
    /* edu_office در seed مدرسهٔ شخصی ندارد (school_id=null) و scope او
       از طریق office حل می‌شود (policy.js:113 schoolInOfficeScope).
       office 1 (استان کردستان) مدرسهٔ ۱ را پوشش می‌دهد — پس school_id
       را صریحاً ۱ می‌دهیم؛ وگرنه inScope به‌درستی out_of_scope می‌دهد. */
    const allowed = {
      manager: { uid: 'a01-manager-1' },
      counselor: { uid: 'a01-counselor-1' },
      eduOffice: { uid: 'a01-eduoffice-1', school_id: 1 },
      superadmin: { uid: 'a01-superadmin-1' },
    };
    for (const key of Object.keys(allowed)) {
      const s = sessions[key];
      const cfg = allowed[key];
      if (!s) { console.log('  ⏭ ' + key + ' — نشست نیست'); continue; }
      const b4 = countReportLogs();
      const r = await syncOp(s.cookie, [mkReportLogOp(s.user, cfg.uid, cfg.school_id)]);
      const res0 = (r.json && r.json.results && r.json.results[0]) || {};
      console.log('  ' + key + ': HTTP ' + r.status + ' → ' + JSON.stringify(res0));
      chk(key + ': op پذیرفته شد (ok=true)', res0.ok === true, JSON.stringify(res0).slice(0, 200));
      const after = await waitForCount(b4 + 1, 6000);
      chk(key + ': رکورد در store نوشته شد', after === b4 + 1, 'b4=' + b4 + ' after=' + after);
    }
  } else { console.log('  ⏳ حالتِ جهش: skip شد'); }

  /* ── A01-4: cross-school و actorهای غیرمجاز دیگر ─────────── */
  console.log('— A01-4: cross-school + سایر actorها —');
  if (!MUT) {
    const s = sessions.teacher;
    if (s) {
      const b4 = countReportLogs();
      const r = await syncOp(s.cookie, [mkReportLogOp(s.user, 'a01-teacher-cross', otherSchool)]);
      const res0 = (r.json && r.json.results && r.json.results[0]) || {};
      const after = await settleCount();
      console.log('  teacher→school دیگر: HTTP ' + r.status + ' → ' + JSON.stringify(res0));
      chk('teacher→school دیگر: op رد شد', res0.ok === false, JSON.stringify(res0).slice(0, 200));
      chk('teacher→school دیگر: رکورد نوشته نشد', after === b4, 'b4=' + b4 + ' after=' + after);
    }
    for (const key of ['student', 'parent']) {
      const s2 = sessions[key];
      if (!s2) { console.log('  ⏭ ' + key + ' — نشست نیست'); continue; }
      const b4 = countReportLogs();
      const r = await syncOp(s2.cookie, [mkReportLogOp(s2.user, 'a01-' + key + '-1')]);
      const res0 = (r.json && r.json.results && r.json.results[0]) || {};
      const after = await settleCount();
      console.log('  ' + key + ': HTTP ' + r.status + ' → ' + JSON.stringify(res0));
      chk(key + ': report_logs ins رد شد', res0.ok === false, JSON.stringify(res0).slice(0, 200));
      chk(key + ': رکورد نوشته نشد', after === b4, 'b4=' + b4 + ' after=' + after);
    }
  } else { console.log('  ⏳ حالتِ جهش: skip شد'); }

  /* ── A01-5: unauthenticated + school_id forge ────────────── */
  console.log('— A01-5: unauthenticated + جعلِ school_id —');
  if (!MUT) {
    const r = await syncOp(null, [mkReportLogOp(teacher, 'a01-anon-1')]);
    chk('بدون نشست: 401', r.status === 401, 'status=' + r.status);
    const s = sessions.teacher;
    if (s) {
      const b4 = countReportLogs();
      /* teacher سعی می‌کند school_id را به مدرسهٔ دیگر بکشد */
      const op = mkReportLogOp(s.user, 'a01-teacher-forge', otherSchool);
      op.school_id = s.user.school_id; /* ظاهراً خودش — ولی data.school_id مدرسهٔ دیگر */
      const r2 = await syncOp(s.cookie, [op]);
      const res0 = (r2.json && r2.json.results && r2.json.results[0]) || {};
      const after = await settleCount();
      console.log('  teacher data.school_id جعلی: HTTP ' + r2.status + ' → ' + JSON.stringify(res0));
      chk('teacher با data.school_id جعل‌شده: op رد شد', res0.ok === false, JSON.stringify(res0).slice(0, 200));
      chk('teacher با data.school_id جعل‌شده: رکورد نوشته نشد', after === b4, 'b4=' + b4 + ' after=' + after);
    }
  } else { console.log('  ⏳ حالتِ جهش: skip شد'); }

  /* ── A01-6: source-level audit + mutation verdict ──────────── */
  console.log('— A01-6: source-level audit —');
  {
    const src = fs.readFileSync(SYNC_PATH, 'utf8');
    chk('sync.js: fieldGate وجود دارد', src.indexOf('function fieldGate(') !== -1);
    chk('sync.js: canOp داخل fieldGate فراخوانی می‌شود', src.indexOf('!canOp(s.role, op.c, op.t)') !== -1);
    chk('sync.js: ردِ per-op با results.push + continue', src.indexOf('results.push({ uid: op.uid, ok: false, code: fv.code') !== -1);
    const wr = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'write-perms.json'), 'utf8'));
    const ins = (wr.ops.report_logs || {}).ins || [];
    chk('write-perms.json: teacher در report_logs.ins نیست', ins.indexOf('teacher') === -1, JSON.stringify(ins));
    console.log('  report_logs.ins = ' + JSON.stringify(ins));
  }

  /* ── A01-7: mutation verdict (unit-level negative proof) ───── */
  console.log('— A01-7: fieldGate روی report_logs (unit-level) —');
  {
    const syncMod = require(SYNC_PATH);
    const fg = syncMod.fieldGate;
    chk('fieldGate از ماژول صادر شده', typeof fg === 'function');
    const mockTeacher = { id: 4, role: 'teacher', school_id: 1 };
    const mockManager = { id: 2, role: 'manager', school_id: 1 };
    const goodOp = { c: 'report_logs', t: 'ins', data: { kind: 'attendance', format: 'pdf', generated_by: '4', status: 'pending', school_id: 1 } };
    const tRes = fg(goodOp, mockTeacher, false);
    const mRes = fg(goodOp, mockManager, false);
    if (MUT === 'VULN') {
      /* همان assertions حالتِ FIXED عمداً تکرار می‌شوند — تحتِ کدِ
         آسیب‌پذیر این проверка باید FAIL شود. اگر سبز ماند یا یعنی جهش
         اثر نکرده یا یعنی negative proof مرده است (false green). */
      console.log('  VULN gate: teacher → ' + JSON.stringify(tRes));
      chk('VULN: fieldGate باید teacher را رد کند (تستِ نقشِ منفی باید تحتِ جهش FAIL شود)',
        tRes && tRes.code === 'role_denied', JSON.stringify(tRes));
    } else {
      console.log('  FIXED gate: teacher → ' + JSON.stringify(tRes));
      console.log('  FIXED gate: manager → ' + JSON.stringify(mRes));
      chk('FIXED: fieldGate teacher را رد می‌دهد (role_denied)', tRes && tRes.code === 'role_denied', JSON.stringify(tRes));
      chk('FIXED: fieldGate manager را عبور می‌دهد', mRes === null, JSON.stringify(mRes));
    }
  }

  console.log('────────────────────────────────────────────────────────');
  console.log('A01 reproduction: ' + pass + ' ✅ / ' + fail + ' ❌');
  if (fail) { for (const e of errors) console.log('   ✗ ' + e); }
  /* لوله‌هایِ stdioِ فرزندِ زنده event loopِ پدر را بیدار نگه می‌دارند و
     رویدادِ exit هرگز صدا نمی‌خورد — سرور یتیم می‌ماند، پورت را آزاد
     نمی‌کند و اجرایِ بعدی EADDRINUSE می‌گیرد (در CI کلِ step هنگ
     می‌کند). بنابراین سرور را صریحاً می‌بندیم و با کدِ نتیجه خارج
     می‌شویم. */
  if (srv && srv.proc) close(srv.proc);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('CRASH', e); process.exitCode = 2; });
