#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   docs-health.js — تستِ سلامت لینک‌های مستندات (مستقل از پوسته):
     DH-TOOL  ابزار tools/docs-health.sh موجود و قابل اجراست
     DH-SCAN  پویش مستقل: صفر لینک شکسته در همهٔ اسناد
     DH-REP   گزارش docs/DOCS_HEALTH_REPORT.md تازه و سالم است
   اجرا: node tests/docs-health.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }

grp('DH-TOOL — ابزار');
const tool = path.join(ROOT, 'tools', 'docs-health.sh');
chk('tools/docs-health.sh وجود دارد', fs.existsSync(tool));
let toolOut = '', toolOk = false;
try { toolOut = execFileSync('bash', [tool], { cwd: ROOT, encoding: 'utf8' }); toolOk = true; } catch (e) { toolOut = String(e.stdout || '') + String(e.message); }
chk('اجرای ابزار موفق (کد خروجی صفر)', toolOk, toolOut.slice(0, 120));
chk('ابزار شمارش را گزارش می‌کند', /لینک بررسی شد/.test(toolOut));

grp('DH-SCAN — پویش مستقل');
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const files = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
let checked = 0; const broken = [];
for (const f of files) {
  const txt = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
  let m;
  while ((m = LINK_RE.exec(txt)) !== null) {
    const t = m[1];
    if (/^https?:|^mailto:|^#|^</.test(t)) continue;
    let p = t.split('#')[0];
    if (!p || /NNN_|<|>|\$\{|\[|\]|\*/.test(p)) continue;
    const gh = p.match(/^\/rezaa2544\/p2\/(?:blob|tree)\/[^/]+\/(.+)$/);
    if (gh) p = gh[1];
    if (path.isAbsolute(p)) continue;
    checked++;
    const ok = fs.existsSync(path.resolve(ROOT, 'docs', p)) || fs.existsSync(path.resolve(ROOT, p));
    if (!ok) broken.push(f + ' -> ' + t);
  }
}
chk('پویش مستقل حداقل ۵۰ لینک داخلی دید', checked >= 50, String(checked));
chk('صفر لینک شکسته', broken.length === 0, broken.slice(0, 5).join(' , '));

grp('DH-REP — گزارش');
const rep = path.join(ROOT, 'docs', 'DOCS_HEALTH_REPORT.md');
chk('گزارش وجود دارد', fs.existsSync(rep));
if (fs.existsSync(rep)) {
  const body = fs.readFileSync(rep, 'utf8');
  chk('گزارش ماشین‌ساز است (تولید با ابزار)', /ماشینی/.test(body) && /docs-health\.sh/.test(body));
  chk('نتیجهٔ صفر شکسته در گزارش', /صفر لینک شکسته/.test(body) || /\*\*0\*\*/.test(body));
  chk('تاریخ اجرا در گزارش هست', /20[0-9]{2}-[0-9]{2}-[0-9]{2}/.test(body));
}

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ سلامت لینک‌ها تأیید شد.');
