#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server16-mutations.js — جهش‌مندیِ دروازه‌هایِ R96
   ─────────────────────────────────────────────────────────────
   M1: fieldGate خاموش شود → M1b (مجموعهٔ ناشناخته) باید شکست بخورد
   M2: canOp همیشه-درست → ماتریس (سلول‌هایِ رد) باید شکست بخورد
   M3: چکِ مالکیت خاموش شود → M4d (graded_byِ جعلی) باید شکست بخورد
   M4: دروازهٔ status خاموش شود → M3h (خودتأییدِ مرخصی) باید شکست بخورد
   M5: چکِ iat خاموش شود → J7 (replay) باید شکست بخورد
   M6: cooldown خاموش شود → O2 (سقفِ ارسالِ مکرر) باید شکست بخورد
   هر جهش: جایگزینی، اجرایِ suite، بررسیِ شکست، بازگشتِ فایل.
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'server/sync.js', suite: 'tests/server16.js',
    bad: 'const fv = fieldGate(op, s, iepUsersUpdate(s, op) || dropUsersUpdate(s, op));',
    mut: 'const fv = null; /* MUTATION: fieldGate off */',
    name: 'M1 fieldGate خاموش شد',
    expectFail: 'ماتریس'
  },
  {
    file: 'server/sync.js', suite: 'tests/server16.js',
    bad: "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
    mut: "if(false) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' }; /* MUTATION */",
    name: 'M2 canOp همیشه-درست شد',
    expectFail: 'ماتریس'
  },
  {
    file: 'server/sync.js', suite: 'tests/server16.js',
    bad: "if(d[ok] != null && Number(d[ok]) !== s.id) return { code: 'ownership_forge', msg: 'شناسهٔ مالکیت قابلِ تغییر نیست' };",
    mut: "if(false) return { code: 'ownership_forge', msg: 'شناسهٔ مالکیت قابلِ تغییر نیست' }; /* MUTATION */",
    name: 'M3 چکِ مالکیت خاموش شد',
    expectFail: 'M4d'
  },
  {
    file: 'server/sync.js', suite: 'tests/server16.js',
    bad: 'if(d.status != null){',
    mut: 'if(false){ /* MUTATION: status gate off */',
    name: 'M4 دروازهٔ status خاموش شد',
    expectFail: 'M4x'
  },
  {
    file: 'server/auth.js', suite: 'tests/server17.js',
    bad: "if(typeof payload.iat !== 'number' || payload.iat * 1000 > Date.now() + 5 * 60 * 1000\n       || Date.now() - payload.iat * 1000 > SESSION_TTL_S * 1000) return { err: 'bad_iat' };",
    mut: "if(false) return { err: 'bad_iat' }; /* MUTATION: iat check off */",
    name: 'M5 چکِ iat خاموش شد',
    expectFail: 'J7'
  },
  {
    file: 'server/auth.js', suite: 'tests/server17.js',
    bad: "if(now - (cd[phone] || 0) < CODE_COOLDOWN_MS) return sendJson(res, 429, { ok: false, code: 'rate_limited' });",
    mut: "if(false) return sendJson(res, 429, { ok: false, code: 'rate_limited' }); /* MUTATION */",
    name: 'M6 cooldown خاموش شد',
    expectFail: 'O2'
  }
];

let killed = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  let out = '', crashed = false;
  const cmd = 'node --max-old-space-size=1500 ' + m.suite;
  try { execSync(cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') {
      try { execSync(cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = 'خطا: فرایند بدون خروجی (محیط)';
  }
  const fails = out.split('\n').filter(l => l.includes('❌'));
  const killedThis = crashed ? (m.crashOK === true) : (fails.length > 0 && fails.some(l => l.includes(m.expectFail)));
  fs.writeFileSync(m.file, src0);
  console.log('  ' + (killedThis ? '✅' : '❌') + ' ' + m.name + ' — ' + (killedThis ? 'کشته شد' : 'زنده ماند! (نخست: ' + (fails[0] || out.slice(0, 80)).trim() + ')'));
  if (killedThis) killed++;
}

console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
const o16 = execSync('node --max-old-space-size=1500 tests/server16.js', { stdio: 'pipe' }).toString();
console.log('  server16: ' + (o16.split('\n').find(l => l.includes('سبز')) || o16.slice(-120)).trim());
const o17 = execSync('node --max-old-space-size=1500 tests/server17.js', { stdio: 'pipe' }).toString();
console.log('  server17: ' + (o17.split('\n').find(l => l.includes('سبز')) || o17.slice(-120)).trim());
console.log(killed === MUTS.length ? 'همهٔ ' + MUTS.length + ' جهش کشته شدند ✅' : 'فقط ' + killed + '/' + MUTS.length + ' جهش کشته شد ❌');
process.exit(killed === MUTS.length ? 0 : 1);
