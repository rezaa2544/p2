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

function mutate(transformFn, killRe, tag) {
  const orig = fs.readFileSync(F, 'utf8');
  try {
    const next = transformFn(orig);
    if (next === orig) { chk(tag + ' (جهش پیدا نشد)', false); return; }
    const mcopy = kit.mutant(F, next);
    try { fs.chmodSync(mcopy, fs.statSync(F).mode); } catch (_) { /* ignore */ }
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: kit.env() });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-240).replace(/\n/g, ' '));
  } finally {
    kit.clear(F);
  }
}

console.log('\n▸ جهش‌ها');
mutate(
  (s) => s.replace(/rc >= maxRetries/g, 'false /*MUT*/'),
  /❌ O3c/, 'M1 حذف سقف تلاش');

mutate(
  (s) => s
    .replace('events = await outbox.fetchPendingBatch(50);', 'events = Array.isArray(store.outbox) ? store.outbox : []; /*MUT*/')
    .replace("if ((status !== 'pending' && status !== 'processing') || inFlight.has(evt.id)) continue;", 'if (inFlight.has(evt.id)) continue; /*MUT*/'),
  /❌ O2/, 'M2 پردازش دوباره');

mutate(
  (s) => s.replace(
    '        } catch (err) {',
    '        } catch (err) { if (Array.isArray(store.outbox)) { const i2 = store.outbox.indexOf(evt); if (i2 > -1) store.outbox.splice(i2, 1); } return { processed: 0, failedDelta: 0 }; /*MUT*/'
  ),
  /❌ O3d/, 'M3 حذف رویداد در شکست');

const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);
console.log('────────────────────────────────────────────────────');
console.log('جهش‌های ویو ۸: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? '  —  ' + fail + ' ناموفق' : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
