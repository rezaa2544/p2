#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server-mutations.js — جهش‌مندیِ «اتصال به سرور» (مرحلهٔ ۱)
   ─────────────────────────────────────────────────────────────
   سه جهشِ سمتِ سرور (تست: tests/server1.js):
     M1 لغوِ جراینِ نشست (jti)
     M2 دور زدنِ دامنهٔ مدرسه (scope)
     M3 نقشِ همه‌گیر (canWrite)
   چهار جهشِ سمتِ کلاینت (تست: tests/server2.js):
     M4 دتکتِ سرور بدونِ گاردِ پروتکل (file://)
     M5 چکِ /me که نشستِ محلی را پاک نمی‌کند
     M6 ورودی که وضعیتِ خطای سرور را نادیده می‌گیرد
     M7 خروجی که به سرور خبر نمی‌دهد
   چهار جهشِ مرحلهٔ ۲ (TLS + پُلِ دوره‌ای):
     M9 فیلترِ scope در bell.js (تست: tests/server5.js)
     M10 پرچمِ Secure در کوکی (تست: tests/server4.js)
     M11 گاردِ بدنِ پاسخ در تیکِ سروری (تست: tests/server5.js)
     M12 اولویتِ overlayِ حضور (تست: tests/server5.js)
     M13 گاردِ روزِ غیرحضوریِ سرور (تست: tests/server6.js)
     M14/M15 حذفِ حساب: پیوندِ شکسته‌نشدنی / تقلیل به غیرفعال (تست: tests/security2.js + tests/server7.js)
     M16/M17 پشتیبان/بازیابی: گاردِ نقش / اعتبارسنجیِ فایل (تست: tests/server8.js)
     M18 بکاپِ خودکار: زمان‌بندیِ درون‌پروسه (تست: tests/server9.js)
     M19 صفحهٔ وبِ سیاستِ حریم خصوصی: روتِ /privacy (تست: tests/server10.js)
   هر جهش: جایگزینی، build، اجرای تستِ مربوطه، بررسیِ شکست، بازگشت.
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'server/auth.js', suite: 'tests/server1.js', heap: 1500,
    bad: "if(typeof payload.jti !== 'string' || store.__revoked_jti[payload.jti]) return { err: 'revoked' };",
    mut: "if(typeof payload.jti !== 'string' || false) return { err: 'revoked' };",
    name: 'M1 لغوِ جراینِ نشست (jti)',
    expectFail: 'S11'
  },
  {
    file: 'server/sync.js', suite: 'tests/server1.js', heap: 1500,
    bad: "  return s === u.school_id;",
    mut: "  return true;",
    name: 'M2 دور زدنِ دامنهٔ مدرسه (scope)',
    expectFail: 'S17'
  },
  {
    file: 'server/sync.js', suite: 'tests/server12.js', heap: 1500,
    /* R96 P0-1: دروازهٔ نقشِ واحد = canOp درون fieldGate (canWrite منسوخ شد).
       target: S8 — teacher ins leaves؛ اگر دروازه خاموش شود عملیات PASS می‌کند. */
    bad: "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
    mut: "if(false && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
    name: 'M3 نقشِ همه‌گیر (canOp در fieldGate)',
    expectFail: 'S8'
  },
  {
    file: 'src/js/00-data-layer.js', suite: 'tests/server2.js', heap: 1500,
    bad: "if(proto !== 'http:' && proto !== 'https:') return Promise.resolve(false);",
    mut: "if(false) return Promise.resolve(false);",
    name: 'M4 دتکتِ سرور بدونِ گاردِ پروتکل',
    expectFail: 'A2'
  },
  {
    file: 'src/js/24-edu-office.js', suite: 'tests/server2.js', heap: 1500,
    bad: "} else if(S.user){\n        S.user = null; Store.remove(SESSION_KEY); changed = true;",
    mut: "} else if(false && S.user){\n        S.user = null; Store.remove(SESSION_KEY); changed = true;",
    name: 'M5 چکِ /me پاک‌کننده نیست',
    expectFail: 'G1'
  },
  {
    file: 'src/js/19-actions-core.js', suite: 'tests/server2.js', heap: 1500,
    bad: "if(r.status<400&&b&&b.ok&&b.user){",
    mut: "if(b&&b.user){",
    name: 'M6 ورود نادیده‌گیرِ ردِ بدنه',
    expectFail: 'H1'
  },
  {
    file: 'src/js/19-actions-core.js', suite: 'tests/server2.js', heap: 1500,
    bad: "try{ Api.post('/api/auth/logout'); }catch(e){}",
    mut: "if(false){}",
    name: 'M7 خروج بدونِ خبرِ سرور',
    expectFail: 'F2'
  },
  {
    file: 'src/js/00-data-layer.js', suite: 'tests/server3.js', heap: 1500,
    bad: "SYNC.queue = SYNC.queue.filter(function(x){ return x && x.user_id != null; });",
    mut: "SYNC.queue = SYNC.queue.filter(function(x){ return true; });",
    name: 'M8 عملیات‌های بی‌هویت در صفِ سروری می‌مانند',
    expectFail: 'S5a'
  },
  {
    file: 'server/bell.js', suite: 'tests/server5.js', heap: 1500,
    bad: "      .filter((p) => p.parent_id === userId)",
    mut: "      .filter((p) => true)",
    name: 'M9 ولی فرزندِ همه را می‌بیند (فیلترِ scope حذف)',
    expectFail: 'B2 parent'
  },
  {
    file: 'server/auth.js', suite: 'tests/server4.js', heap: 1500,
    bad: "    const secure = isHttps(req) ? 'Secure; ' : '';",
    mut: "    const secure = '';",
    name: 'M10 کوکیِ Secure در https حذف شد',
    expectFail: 'T4c'
  },
  {
    file: 'src/js/46-bell-now.js', suite: 'tests/server5.js', heap: 1500,
    bad: "    if(!j || j.ok !== true || typeof j.ts !== 'number' || !Array.isArray(j.family)){",
    mut: "    if(false){",
    name: 'M11 گاردِ بدنِ پاسخ حذف شد (بدنِ هرچنان پذیرفته می‌شود)',
    expectFail: 'C2'
  },
  {
    file: 'src/js/46-bell-now.js', suite: 'tests/server5.js', heap: 1500,
    bad: "      if(r && r.studentId != null) attMap[r.studentId] = (r.att == null ? null : r.att);",
    mut: "      if(false) attMap[r.studentId] = (r.att == null ? null : r.att);",
    name: 'M12 overlayِ حضورِ سرور بی‌اثر شد (att محلی می‌ماند)',
    expectFail: 'C1c'
  },
  {
    file: 'server/sync.js', suite: 'tests/server6.js', heap: 1500,
    bad: "      const vd = virtualDayViolation(op, store);",
    mut: "      const vd = null;",
    name: 'M13 گاردِ روزِ غیرحضوریِ سرور خاموش شد',
    expectFail: 'V1a'
  },
  {
    file: 'server/auth.js', suite: 'tests/security2.js', heap: 1500,
    bad: "    purge('parent_links', r => Number(r.parent_id) === uid || Number(r.student_id) === uid);",
    mut: "    purge('parent_links', r => Number(r.parent_id) === uid);",
    name: 'M14 حذفِ حساب، parent_links را نمی‌شکند (پیوندِ student باقی می‌ماند)',
    expectFail: 'S7'
  },
  {
    file: 'server/auth.js', suite: 'tests/server7.js', heap: 1500,
    bad: "    purge('users', r => Number(r.id) === uid);",
    mut: "    { const u2 = (store.users || []).find(r => Number(r.id) === uid); if(u2) u2.active = false; }",
    name: 'M15 حذفِ حساب به «غیرفعال‌کردن» تقلیل می‌یابد',
    expectFail: 'D2b'
  },
  {
    file: 'server/admin.js', suite: 'tests/server8.js', heap: 1500,
    bad: "    if(s.role !== 'superadmin') return { done: sendJson(res, 403, { ok: false, code: 'forbidden' }) };",
    mut: "    if(false) return { done: sendJson(res, 403, { ok: false, code: 'forbidden' }) };",
    name: 'M16 گاردِ superadmin در پشتیبان/بازیابی خاموش شد',
    expectFail: 'B1'
  },
  {
    file: 'server/admin.js', suite: 'tests/server8.js', heap: 1500,
    bad: "    if(!data || typeof data !== 'object' || !Array.isArray(data.users)){",
    mut: "    if(false){",
    name: 'M17 اعتبارسنجیِ پشتیبانِ خراب حذف شد',
    expectFail: 'B5'
  },
  {
    file: 'server/index.js', suite: 'tests/server9.js', heap: 1500,
    bad: 'if(BACKUP_EVERY_MS > 0) admin.startAutoBackup(BACKUP_EVERY_MS);',
    mut: 'if(false) admin.startAutoBackup(BACKUP_EVERY_MS);',
    name: 'M18 زمان‌بندیِ بکاپِ خودکار خاموش شد',
    expectFail: 'A2'
  },
  {
    file: 'server/index.js', suite: 'tests/server10.js', heap: 1500,
    bad: "  '/privacy':      { file: 'privacy.html', type: 'text/html; charset=utf-8' },",
    mut: '  /* M19: /privacy */',
    name: 'M19 روتِ صفحهٔ وبِ سیاست حذف شد',
    expectFail: 'P1'
  },
  {
    file: 'server/index.js', suite: 'tests/server1.js', heap: 1500,
    bad: "const DEMO_CODE_ECHO = process.env.PAYESH_DEMO_CODE === '1';",
    mut: "const DEMO_CODE_ECHO = (process.env.PAYESH_DEMO_CODE || '1') === '1';",
    name: 'M20 پیش‌فرضِ DEMO_CODE به روشن برگشت (P0-4)',
    expectFail: 'S31'
  }
];

let killed = 0;
let envFails = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log(`  ❌ ${m.name}: الگوی اصلی پیدا نشد در ${m.file}`); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const __r89cmd = `node --max-old-space-size=${m.heap} ${m.suite}`;
  try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  /* R92: env early-death — تست قبل از چاپِ چکِ موردِ انتظار مرد (EADDRINUSE/OOM در استارت) → retry یک‌بار؛ هرگز «زنده ماند»ِ کاذب */
  if (m.crashOK !== true && out !== 'PASSED (no failure)' && /❌/.test(out) && !out.includes(m.expectFail)) {
    let out2 = '', crashed2 = false;
    try { execSync(__r89cmd, { stdio: 'pipe' }); out2 = 'PASSED (no failure)'; }
    catch (e3) {
      out2 = String(e3.stdout || '') + String(e3.stderr || '');
      if (/JavaScript heap out of memory|FATAL|aborting/.test(out2) || out2.trim() === '') crashed2 = true;
    }
    if (!(out2 !== 'PASSED (no failure)' && /❌/.test(out2) && !out2.includes(m.expectFail))) { out = out2; crashed = crashed2; }
  }
  const failed = /❌/.test(out);
  const envFailed = m.crashOK !== true && out !== 'PASSED (no failure)' && failed && !out.includes(m.expectFail);
  const killedThis = envFailed ? false : (crashed ? (m.crashOK === true) : (failed && out.includes(m.expectFail)));
  fs.writeFileSync(m.file, src0);
  const line = (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 150)).trim();
  if (envFailed) {
    envFails++;
    console.log(`  ❌ ${m.name} — خطای محیطی: چکِ ${m.expectFail} هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد`);
  } else {
    console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' + (crashed ? ' (مرگِ فرآیند)' : '') : 'زنده ماند! (خروجی: ' + line + ')'}`);
    if (killedThis) killed++;
  }
}
execSync('node build.js', { stdio: 'pipe' });
console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
/* R97 — اجرایِ پایانه (بدونِ جهش) تحتِ بارِ ۴ لِین گاه می‌مرد و استیسه‌ی
   execSync کلِ سویت را می‌انداخت (کلاسِ R89): try + یک‌بار retry. */
const runBase = (cmd) => {
  try { return execSync(cmd, { stdio: 'pipe' }).toString(); }
  catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
};
let o1 = runBase('node --max-old-space-size=1500 tests/server1.js');
if (o1.indexOf('بدون خطا') < 0) o1 = runBase('node --max-old-space-size=1500 tests/server1.js');
console.log('  server1: ' + (o1.split('\n').find(l => l.includes('موفق')) || o1.slice(-120)).trim());
let o2 = runBase('node --max-old-space-size=1500 tests/server2.js');
if (o2.indexOf('✅') < 0) o2 = runBase('node --max-old-space-size=1500 tests/server2.js');
console.log('  server2: ' + (o2.split('\n').find(l => l.includes('server2 (')) || o2.slice(-120)).trim());
console.log(killed === MUTS.length && envFails === 0 ? `همهٔ ${MUTS.length} جهش کشته شدند ✅` : `فقط ${killed}/${MUTS.length} جهش کشته شد${envFails ? ` + ${envFails} خطای محیطی` : ''} ❌`);
process.exit(killed === MUTS.length && envFails === 0 ? 0 : 1);
