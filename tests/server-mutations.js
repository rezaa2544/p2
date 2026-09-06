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
    file: 'server/sync.js', suite: 'tests/server1.js', heap: 1500,
    bad: "if(!canWrite(s.role, op.c)) return all('role_denied');",
    mut: "if(!canWrite('superadmin', op.c)) return all('role_denied');",
    name: 'M3 نقشِ همه‌گیر (canWrite)',
    expectFail: 'S20'
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
    file: 'src/js/19-actions.js', suite: 'tests/server2.js', heap: 1500,
    bad: "if(r.status<400&&b&&b.ok&&b.user){",
    mut: "if(b&&b.user){",
    name: 'M6 ورود نادیده‌گیرِ ردِ بدنه',
    expectFail: 'H1'
  },
  {
    file: 'src/js/19-actions.js', suite: 'tests/server2.js', heap: 1500,
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
  }
];

let killed = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log(`  ❌ ${m.name}: الگوی اصلی پیدا نشد در ${m.file}`); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync(`node --max-old-space-size=${m.heap} ${m.suite}`, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out)) crashed = true;
  }
  const failed = /❌/.test(out);
  const killedThis = crashed ? (m.crashOK === true) : (failed && out.includes(m.expectFail));
  fs.writeFileSync(m.file, src0);
  const line = (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 150)).trim();
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' + (crashed ? ' (مرگِ فرآیند)' : '') : 'زنده ماند! (خروجی: ' + line + ')'}`);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
const o1 = execSync('node --max-old-space-size=1500 tests/server1.js', { stdio: 'pipe' }).toString();
console.log('  server1: ' + (o1.split('\n').find(l => l.includes('/30')) || o1.slice(-120)).trim());
const o2 = execSync('node --max-old-space-size=1500 tests/server2.js', { stdio: 'pipe' }).toString();
console.log('  server2: ' + (o2.split('\n').find(l => l.includes('server2 (')) || o2.slice(-120)).trim());
console.log(killed === MUTS.length ? `همهٔ ${MUTS.length} جهش کشته شدند ✅` : `فقط ${killed}/${MUTS.length} جهش کشته شد ❌`);
process.exit(killed === MUTS.length ? 0 : 1);
