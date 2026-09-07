#!/usr/bin/env node
/**
 * دور ۷۹ بندهای ۱-۲ — جهش‌های الگوی «دیسپاتچِ بدونِ پارامتر» — پایش
 *
 * هر جهش، دقیقاً همان باگِ پیشین (پارامترِ سای‌کننده) را روی یک اکشن
 * برمی‌گرداند. اگر سئوتِ uiclick آن را نکشد، یعنی از مسیرِ واقعیِ
 * دکمه نمی‌گذرد و فقط تابع را مستقیم صدا می‌زند.
 *
 *  M1 — 'pre-confirm'(el,id) → U1 باید شکست بخورد (id=undefined)
 *  M2 — 'pre-reject'(el,id)  → U2 باید شکست بخورد
 *  M3 — 'pre-del'(el,id)     → U3 باید شکست بخورد
 *  M4 — 'bus-follow-open'(el) → U4 باید شکست بخورد (کرشِ el)
 *
 * اجرا: node tests/uiclick-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, 'tests/uiclick.js')], { cwd: ROOT, encoding: 'utf8' });
    chk(r.status !== 0 && killRe.test(r.stdout || r.stderr || ''), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/19-actions-core.js', "'pre-confirm'(){", "'pre-confirm'(el,id){", /❌ U1/, 'M1 سایِ el/id روی pre-confirm');
mutate('src/js/19-actions-core.js', "'pre-reject'(){", "'pre-reject'(el,id){", /❌ U2/, 'M2 سایِ el/id روی pre-reject');
mutate('src/js/19-actions-core.js', "'pre-del'(){", "'pre-del'(el,id){", /❌ U3/, 'M3 سایِ el/id روی pre-del');
mutate('src/js/19-actions-bus.js', "'bus-follow-open'(){", "'bus-follow-open'(el){", /❌ U4/, 'M4 سایِ el روی bus-follow-open');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/uiclick.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ uiclick سبز است');

console.log(`\nuiclick-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
