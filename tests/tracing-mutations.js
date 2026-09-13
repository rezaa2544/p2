#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — ردیابیِ توزیع‌شده (Jaeger/OpenTelemetry)
   هر جهش باید سوئیتِ مربوط را بشکاند؛ وگرنه تست بی‌اثر است.
   اجرا (از ریشهٔ ریپو): node tests/tracing-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — restore/بازگردانیِ درجا حذف شد. همیشه فقط یک جهشِ
   فعال است (نگاشتِ فایلِ قبلی پیش از جهشِ تازه پاک می‌شود). بیتِ اجراییِ
   کپی از اصلی حفظ می‌شود تا چک‌های bash -n/X_OK معنای خود را نگه دارند. */
const path = require('path');
const { session } = require('./helpers/mutant-kit');
const kit = session('trc-mut-');
const ROOT = path.join(__dirname, '..');

const FILES = {
  'server/tracing.js': fs.readFileSync('server/tracing.js', 'utf8'),
  'server/audit.js': fs.readFileSync('server/audit.js', 'utf8'),
  'server/index.js': fs.readFileSync('server/index.js', 'utf8'),
};

const SAMPLING = 'node tests/tracing-sampling.js';
/* TRACING_MUTS=1 یعنی بخشِ B (Jaeger) پرش شود: جهش‌ها باید بدونِ Jaeger بمیرند. */
const INTEGRATION = 'node tests/tracing-integration.js';

const MUTS = [
  {
    file: 'server/tracing.js', cmd: SAMPLING,
    name: 'M1 پیش‌فرضِ توسعه (always_on) خاموش شود',
    bad: "if(env.NODE_ENV === 'production') return { name: 'parentbased_ratio', arg: 0.1 };\n  return { name: 'always_on', arg: 1 };",
    mut: "if(env.NODE_ENV === 'production') return { name: 'parentbased_ratio', arg: 0.1 };\n  return { name: 'always_off', arg: 0 }; /* MUT */",
    expectFail: 'SMP-sel پیش‌فرضِ توسعه',
  },
  {
    file: 'server/tracing.js', cmd: SAMPLING,
    name: 'M2 پاک‌سازیِ کوئری (redactQuery) بی‌اثر شود',
    bad: "function redactQuery(qs) {\n  return String(qs || '').split('&').map(function(p){\n    const i = p.indexOf('=');\n    const k = (i < 0 ? p : p.slice(0, i)).trim();\n    if(URL_DROP_KEYS.test(k)) return k + '=[REDACTED]';\n    return p;\n  }).join('&');\n}",
    mut: "function redactQuery(qs) {\n  return String(qs || ''); /* MUT */\n}",
    expectFail: 'RED-v',
  },
  {
    file: 'server/audit.js', cmd: INTEGRATION,
    name: 'M3 تزریقِ trace_id به ممیزی حذف شود',
    bad: 'if(__tid) entry.trace_id = __tid;',
    mut: 'if(false) entry.trace_id = __tid; /* MUT */',
    expectFail: 'A4b',
  },
  {
    file: 'server/index.js', cmd: INTEGRATION,
    name: 'M4 سرآیندِ X-Trace-Id ثابتِ none شود',
    bad: "res.setHeader('X-Trace-Id', __tid);",
    mut: "res.setHeader('X-Trace-Id', 'none'); /* MUT */",
    expectFail: 'A1 مسیر',
  },
  {
    file: 'server/tracing.js', cmd: SAMPLING,
    name: 'M6 تشخیص تولید با PAYESH_ENV حذف شود (BUG-5)',
    bad: "if(env.PAYESH_ENV === 'production') return { name: 'parentbased_ratio', arg: 0.1 };",
    mut: "/* MUT: PAYESH_ENV production check removed */",
    expectFail: 'SMP-sel پروداکشنِ PAYESH_ENV',
  },
  {
    file: 'server/tracing.js', cmd: INTEGRATION,
    name: 'M5 حالتِ خاموش (TRACING_ENABLED=false) نادیده گرفته شود',
    bad: 'if(!cfg.enabled){ state = disabled; return state; }',
    mut: 'if(false){ state = disabled; return state; } /* MUT */',
    expectFail: 'A5 خاموش',
  },
];

let prevAbs = null;

let killed = 0;
console.log('\n▸ جهش‌های ردیابی (M1–M6)');
MUTS.forEach((m, i) => {
  const src = fs.readFileSync(m.file, 'utf8');
  if (src.indexOf(m.bad) < 0) {
    console.log(`  ⚠️ ${m.name}: لنگر یافت نشد — جهش اعمال نشد`);
    return;
  }
    const abs = path.join(ROOT, m.file);
  if (prevAbs && prevAbs !== abs) kit.clear(prevAbs);
  const mcopy = kit.mutant(abs, src.replace(m.bad, m.mut)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
  try { fs.chmodSync(mcopy, fs.statSync(abs).mode); } catch (_) {} /* حفظِ مود (بیتِ اجرایی) */
  prevAbs = abs;
  let out = '';
  let crashed = false;
  try {
    out = execSync(m.cmd, {
      stdio: 'pipe',
      timeout: 240000,
      cwd: ROOT,
      env: kit.env({ TRACING_MUTS: '1' }),
    }).toString();
  } catch (e) {
    crashed = true;
    out = String((e.stdout || '') + (e.stderr || ''));
  }
  /* قاتل: سوئیت باید قرمز شود و خطِ موردانتظار را گزارش کند. */
  const dead = out.indexOf(m.expectFail) >= 0 && /❌|ناموفق/.test(out);
  if (dead) { killed++; console.log(`  ✅ ${m.name}: کشته شد (${m.expectFail})`); }
  else {
    console.log(`  ❌ ${m.name}: زنده ماند! (crash=${crashed})`);
    console.log('     ' + out.split('\n').slice(-6).join('\n     ').slice(0, 500));
  }
});

if (prevAbs) kit.clear(prevAbs); /* نقشهٔ خالی برای شفافیت؛ پاک‌سازیِ واقعی در exit */
let backGreen = false, finalOut = '';
try {
  finalOut = execSync(SAMPLING + ' && ' + INTEGRATION, {
    stdio: 'pipe', timeout: 420000,
    env: Object.assign({}, process.env, { TRACING_MUTS: '1' }),
  }).toString();
  backGreen = (finalOut.match(/بدون خطا|0 ناموفق/g) || []).length >= 2;
} catch (e) {
  finalOut = String(e.stdout || '');
}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
