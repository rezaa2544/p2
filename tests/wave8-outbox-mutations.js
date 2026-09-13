#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave8-outbox-mutations.js — ویو ۸: آزمون جهشِ کارگر/اوت‌باکس
   ───────────────────────────────────────────────────────────────────
   M1  حذف سقف تلاش (رویداد هرگز failed نمی‌شود)        ⇒ ❌ O3c
   M2  حذف نگهبانِ پردازشِ دوباره (پردازش مکرر)          ⇒ ❌ O2
   M3  حذف رویداد در شکست (از دست رفتن داده)            ⇒ ❌ O3d
   اجرا:  node tests/wave8-outbox-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانی حذف شد (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('w8o-mut-');
const SUITE = path.join(ROOT, 'tests', 'wave8-outbox.js');
const F = path.join(ROOT, 'server', 'worker.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}

console.log('▸ خطِّ پایه');
const base = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
chk('خطِّ پایهٔ wave8-outbox سبز است', base.status === 0, (base.stdout || '').slice(-160));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(find, replace, killRe, tag) {
  const orig = fs.readFileSync(F, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false); return; }
    const mcopy = kit.mutant(F, orig.replace(find, replace)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(F).mode); } catch (_) {}
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: kit.env() });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-240).replace(/\n/g, ' '));
  } finally {
    kit.clear(F); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */
  }
}

console.log('\n▸ جهش‌ها');
mutate(
  `if (rc > maxRetries) { patch.status = 'failed'; failedDelta++; }`,
  `/* سقف تلاش حذف شد — رویداد هرگز failed نمی‌شود */`,
  /❌ O3c/, 'M1 حذف سقف تلاش');

mutate(
  `if (status !== 'pending' || inFlight.has(evt.id)) continue;`,
  `if (inFlight.has(evt.id)) continue; /* پردازش دوبارهٔ غیرپندینگ آزاد شد */`,
  /❌ O2/, 'M2 پردازش دوباره');

mutate(
  `} catch (err) {
          const rc = (Number(evt.retry_count) || 0) + 1;
          const patch = {
            retry_count: rc,
            last_error: (err && (err.message || err.code)) || 'error'
          };
          if (rc > maxRetries) { patch.status = 'failed'; failedDelta++; }
          await outbox.mark(evt.id, patch);
          /* برچسب از مجموعهٔ بسته (retry/failed)؛ متن خطا هرگز label نیست. */
          metrics.inc('payesh_worker_events_total', { outcome: patch.status === 'failed' ? 'failed' : 'retry' });
        } finally {`,
  `} catch (err) {
          /* جهش: رویداد در شکست حذف می‌شود — از دست رفتن داده */
          const i2 = events.indexOf(evt);
          if (i2 > -1) events.splice(i2, 1);
        } finally {`,
  /❌ O3/, 'M3 حذف رویداد در شکست');

const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های ویو ۸: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
