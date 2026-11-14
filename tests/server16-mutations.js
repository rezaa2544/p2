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
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('s16-mut-');
const ROOT = path.join(__dirname, '..');

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

let killed = 0, prevFile = null;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  if (prevFile && prevFile !== abs) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = abs;
  /* نرمال‌سازی CRLF→LF: چک‌اوتِ ویندوزی سوزن‌های \n را نمی‌یافت
     («الگوی اصلی پیدا نشد» — بازتولیدِ محلی 2026-11-13؛ CI همان لاین را
     با LF سبز می‌گذاشت — همان عیب، دو چهره) */
  const src0 = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file + ' — جهش ناممکن، شمارشِ کشته‌نشدہ'); continue; }
  kit.mutant(abs, src0.replace(m.bad, m.mut, 1)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  let out = '', crashed = false;
  const args = ['--max-old-space-size=1500', m.suite];
  try { execFileSync('node', args, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') {
      try { execFileSync('node', args, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = 'خطا: فرایند بدون خروجی (محیط)';
  }
  const fails = out.split('\n').filter(l => l.includes('❌'));
  const killedThis = crashed ? (m.crashOK === true) : (fails.length > 0 && fails.some(l => l.includes(m.expectFail)));
  console.log('  ' + (killedThis ? '✅' : '❌') + ' ' + m.name + ' — ' + (killedThis ? 'کشته شد' : 'زنده ماند! (نخست: ' + (fails[0] || out.slice(0, 80)).trim() + ')'));
  if (killedThis) killed++;
}

console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
/* اجرای خطِ پایه هم داخلِ catch: خروجِ غیرصفرِ سوئیتِ پایه نباید هارنس را
   با آبجکتِ خامِ spawnSync منفجر کند (بازتولید CI: run 43494805124،
   481s + dumpِ 4KBِ بایت‌ها) — باید ❌ خوانا و خروجِ صریح بدهد. */
let baseFail = false;
const baseRun = (label, args) => {
  try {
    const o = execFileSync('node', args, { stdio: 'pipe' }).toString();
    console.log('  ' + label + ': ' + (o.split('\n').find(l => l.includes('سبز')) || o.slice(-120)).trim());
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    baseFail = true;
    console.log('  ' + label + ': ❌ خطِ پایه شکست (exit=' + (e.status == null ? '?' : e.status) + ')');
    const bads = out.split('\n').filter(l => l.includes('❌'));
    for (const b of bads.slice(0, 6)) console.log('    ' + b.trim().slice(0, 200));
    if (!bads.length) console.log('    ' + out.slice(-300).replace(/\n+/g, ' | ').slice(0, 300));
  }
};
baseRun('server16', ['--max-old-space-size=1500', 'tests/server16.js']);
baseRun('server17', ['--max-old-space-size=1500', 'tests/server17.js']);
console.log(killed === MUTS.length && !baseFail ? 'همهٔ ' + MUTS.length + ' جهش کشته شدند ✅' : 'فقط ' + killed + '/' + MUTS.length + ' جهش کشته شد' + (baseFail ? ' + خطِ پایه شکست' : '') + ' ❌');
process.exit(killed === MUTS.length && !baseFail ? 0 : 1);
