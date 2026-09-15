#!/usr/bin/env node
// tests/config-audit.js — تست مغایرت‌یابی پیکربندی کد/سند (مأموریت ۳۷، چت ۶)
// ۱) اجرای ابزار روی ریپو: خروجی ۰. ۲) پروندهٔ منفی: حذف یک ردیف ⇒ تشخیص.
// ۳) پینِ فیلترِ sh-local (C6-03): مثبت‌های کاذبِ «اسکریپت‌های shell با نسبتِ
//    پیش‌فرض‌دار ولی محلی و بدون export» نباید fatal شوند؛ فیلتر در
//    tools/config-audit.js (shLocalsFile) و حذفِ آن ⇒ این تست FAIL (گازِ تست).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
let pass = 0, fail = 0;
const failures = [];
function chk(name, ok) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'config-audit.js');
const DOC = path.join(ROOT, 'docs', 'CONFIGURATION_REFERENCE.md');

console.log('■ اجرای ابزار روی ریپو');
chk('ابزار ممیزی وجود دارد', fs.existsSync(TOOL));
let out = '', code = 0;
try { out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' }); }
catch (e) { code = e.status || 1; out = (e.stdout || '') + (e.stderr || ''); }
chk('صفر مغایرت در ریپو (خروجی ۰)', code === 0);
chk('پیام «هیچ متغیر کدی بی‌سند نیست»', out.includes('هیچ متغیر کدی بی‌سند نیست'));

console.log('\n■ پروندهٔ منفی درون‌حافظه‌ای');
// اگر ردیف REDIS_URL از سند حذف شود، ابزارِ شبیه‌سازی‌شده باید مغایرت ببیند.
const doc = fs.readFileSync(DOC, 'utf8');
const docVars = new Set();
const s2 = doc.slice(doc.indexOf('## ۲) متغیرهای محیطی'), doc.indexOf('## ۳)'));
for (const line of s2.split('\n')) {
  if (!line.startsWith('|')) continue;
  const first = line.split('|')[1] || '';
  for (const bt of first.split('·')) {
    const m = bt.match(/`([A-Z_][A-Z0-9_]*)`/);
    if (m) docVars.add(m[1]);
  }
}
// مجموعهٔ کوچک کد برای شبیه‌سازی (متغیرهای حیاتی که حتماً در کد هستند)
const CODE_CORE = ['REDIS_URL', 'DATABASE_URL', 'PAYESH_JWT_SECRET', 'PORT', 'NODE_ENV', 'PAYESH_ENV'];
chk('همهٔ متغیرهای هسته در سند هستند', CODE_CORE.every((v) => docVars.has(v)));
const removed = new Set([...docVars].filter((v) => v !== 'REDIS_URL'));
chk('حذف ردیف ⇒ مغایرت شکار می‌شود', CODE_CORE.some((v) => !removed.has(v)) && !removed.has('REDIS_URL'));

console.log('\n■ همسانی شمارش');
chk('دست‌کم ۹۰ متغیر در §۲ سند (' + fa(docVars.size) + ')', docVars.size >= 90);
chk('دست‌کم ۷۰ متغیر در کد', out.includes('متغیرهای کد:') && parseInt(out.split('متغیرهای کد: ')[1], 10) >= 70);

console.log('\n■ فیلتر sh-local (پینِ مثبت‌های کاذب — C6-03)');
// (الف) بازتولیدِ مستقلِ مجموعهٔ انتظار: متغیرهای .sh که (۱) با نسبتِ
// پیش‌فرض‌دار ${V:-} خوانده می‌شوند، (۲) در همان فایل نسبتِ بدون export دارند
// (محلیِ shell)، (۳) در سند نیستند و (۴) در استثناهای test-local نیستند.
// هر عضو این مجموعه باید توسط فیلترِ shLocalsFile از fatal خارج شود.
function walkCfg(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'data') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkCfg(p, acc);
    else if (e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.sh'))) acc.push(p);
  }
  return acc;
}
const codeFilesCfg = [...walkCfg(path.join(ROOT, 'server'), []), ...walkCfg(path.join(ROOT, 'tools'), [])];
const RE_SH_CFG = /\$\{([A-Z_][A-Z0-9_]*):-/g;
const RE_SH_ASSIGN_CFG = /^[ \t]*(?:export[ \t]+)?([A-Z_][A-Z0-9_]*)[ \t]*=/gm;
const shLocalsUndocumented = new Set();
for (const f of codeFilesCfg) {
  if (!f.endsWith('.sh')) continue;
  const t = fs.readFileSync(f, 'utf8');
  const used = new Set();
  let m;
  while ((m = RE_SH_CFG.exec(t)) !== null) used.add(m[1]);
  let a;
  while ((a = RE_SH_ASSIGN_CFG.exec(t)) !== null) {
    const ls = t.lastIndexOf('\n', a.index) + 1;
    const le = t.indexOf('\n', a.index);
    const line = t.slice(ls, le === -1 ? t.length : le);
    if (!/^\s*export\s/.test(line) && used.has(a[1])) shLocalsUndocumented.add(a[1]);
  }
}
const SH_LOCALS_CFG = new Set(['BAD', 'NEW', 'TARGET']);
const S = [...shLocalsUndocumented].filter((v) => !docVars.has(v) && !SH_LOCALS_CFG.has(v)).sort();
chk('پین غیرخلاء: دست‌کم یک sh-local بی‌سند با ${V:- در ریپو هست (' + fa(S.length) + ': ' + (S.join(',') || '—') + ')', S.length >= 1);
chk('هیچ عضو S در خروجی fatal ابزار نیست (فیلتر فعال است)', S.every((v) => !out.includes('  - ' + v + '\n')));

// (ب) پرونده‌های معزول (tmpdir): کپیِ بایت‌به‌بایتِ ابزارِ واقعی روی درختِ
//     کنترل‌شده — مثبت (sh-local ⇒ fatal نیست)، کنترلِ export (بی‌سند ⇒ fatal
//     می‌ماند؛ فیلتر بیش از حد کار نمی‌کند)، و گازِ تست (حذفِ موقتِ فیلتر در
//     کپی ⇒ مثبت باید fatal شود). ابزارِ ریپو دست نمی‌خورد.
const toolSrc = fs.readFileSync(TOOL, 'utf8');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const COPY_SHA = sha256(toolSrc);
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgaudit-'));
function makeFixture(name, shBody, toolText) {
  const r = path.join(FIX, name);
  fs.mkdirSync(path.join(r, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(r, 'server'), { recursive: true });
  fs.mkdirSync(path.join(r, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(r, 'tools', 'config-audit.js'), toolText);
  fs.writeFileSync(path.join(r, 'tools', 'fixture.sh'), shBody);
  fs.writeFileSync(path.join(r, 'server', 'stub.js'), '/* stub */\n');
  fs.writeFileSync(path.join(r, 'docs', 'CONFIGURATION_REFERENCE.md'),
    '# مرجع آزمایشی\n\n## ۲) متغیرهای محیطی\n\n| متغیر |\n|---|\n\n## ۳) فایل‌های پیکربندی\n\n—\n');
  return r;
}
function runFixture(r) {
  try {
    const o = execFileSync(process.execPath, [path.join(r, 'tools', 'config-audit.js')], { encoding: 'utf8' });
    return { code: 0, out: o };
  } catch (e) { return { code: e.status || 1, out: ((e.stdout || '') + (e.stderr || '')) }; }
}
const SH_BODY_LOCAL = 'A_LOCAL_TESTVAR=1\necho "${A_LOCAL_TESTVAR:-d}"\n';
try {
  const fA = makeFixture('A-local', SH_BODY_LOCAL, toolSrc);
  chk('کپیِ fixture با ابزارِ اصلیِ ریپو بایت‌به‌بایت یکسان است',
    sha256(fs.readFileSync(path.join(fA, 'tools', 'config-audit.js'), 'utf8')) === COPY_SHA);
  const rA = runFixture(fA);
  chk('A: sh-local بدون export با ${V:- ⇒ fatal نیست (خروجی ۰)', rA.code === 0 && rA.out.includes('هیچ متغیر کدی بی‌سند نیست'));
  chk('A: نامِ sh-local در خروجی ظاهر نمی‌شود', !rA.out.includes('A_LOCAL_TESTVAR'));

  const fB = makeFixture('B-export', 'export B_EXPORT_TESTVAR=1\necho "${B_EXPORT_TESTVAR:-d}"\n', toolSrc);
  const rB = runFixture(fB);
  chk('B: متغیرِ export‌شده و بی‌سند ⇒ همچنان fatal (خروجی ۱؛ فیلتر بیش‌ازحد نیست)',
    rB.code === 1 && rB.out.includes('  - B_EXPORT_TESTVAR'));

  const FILTER_CLAUSE = ' && !shLocalsFile.has(v)';
  const stripped = toolSrc.replace(FILTER_CLAUSE, '');
  chk('حذفِ موقتِ فیلتر در کپی (نه ابزارِ ریپو) انجام شد',
    stripped !== toolSrc && !stripped.includes('!shLocalsFile.has(v)') && stripped.includes('!docVars.has(v)'));
  const fC = makeFixture('C-filter-stripped', SH_BODY_LOCAL, stripped);
  const rC = runFixture(fC);
  chk('C: گازِ تست — با حذفِ فیلتر، sh-local fatal می‌شود (خروجی ۱)',
    rC.code === 1 && rC.out.includes('  - A_LOCAL_TESTVAR'));
} finally {
  fs.rmSync(FIX, { recursive: true, force: true });
}

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:\n  - ' + failures.join('\n  - ')); process.exit(1); }
