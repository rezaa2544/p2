#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   secret-scan — اسکنِ اعتبارسنجی (R96, P1-9)
   ───────────────────────────────────────────────────────────────────
   هر فایلِ پروژه (به‌جز node_modules/dist/data) را با الگوهایِ
   شناخته‌شدهٔ اعتبارسنجی اسکن می‌کند:
     • GitHub (ghp_/gho_/github_pat_/fine-grained)
     • AWS (AKIA / private key)
     • PEM private key blocks
     • hex ≥ 64 کاراکتر (kandide: JWT/key)
   + بررسیِ پوششِ .gitignore برایِ کلاس‌هایِ حساس.
   allowlist: server/data/payesh.json (رمزِ دمو '123456' — فقط برای
   الگویِ weak-password که اینجاست).
   اجرا: node tests/secret-scan.js   (خروجی ۱ = نفوذ)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build', '.venv']);
const SKIP_PATHS = new Set(['server' + path.sep + 'data']);

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}

const PATTERNS = [
  { name: 'GitHub token (ghp/gho/gsh)', re: /\b(ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}\b/g },
  { name: 'GitHub fine-grained', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'PEM private key', re: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP)? ?PRIVATE KEY-----/g },
  { name: 'long hex (≥64) — کاندیدای کلید', re: /\b[0-9a-fA-F]{64,}\b/g },
  { name: 'Bearer/Authorization hardcoded', re: /Authorization['"]?\s*[:=]\s*['"][A-Za-z0-9._\-]{16,}/g },
];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.git')) continue;
      if (SKIP_PATHS.has(path.relative(ROOT, path.join(dir, e.name)))) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.js') || e.name.endsWith('.json') || e.name.endsWith('.html') || e.name.endsWith('.md') || e.name.endsWith('.env') || e.name.endsWith('.sh') || e.name.endsWith('.yml') || e.name.endsWith('.yaml')
      /* S7-9c (دور ۵ چت ۳): PAT زندهٔ setup-deps.ps1 (حادثهٔ #74) از این اسکن
         نامرئی بود — .ps1/.psm1/.bat/.cmd هم اسکریپت‌های اعتبارسنجی‌خیزند. */
      || e.name.endsWith('.ps1') || e.name.endsWith('.psm1') || e.name.endsWith('.bat') || e.name.endsWith('.cmd')) {
      out.push(path.relative(ROOT, path.join(dir, e.name)));
    }
  }
}

const files = [];
walk(ROOT, files);
console.log('');
console.log('— اسکنِ ' + files.length + ' فایل —');
let hits = 0;
const hexAllow = { 
  'build.js': 1, 
  'server/tls-cert.js': 1, 
  'server/seed.js': 1, 
  'tests/tls-self.js': 1,
  '.claude/proven-config.json': 1, 
  '.claude-flow/harness-active-policy.json': 1,
  '.claude\\proven-config.json': 1,
  '.claude-flow\\harness-active-policy.json': 1
};
/* استثناهایِ «hex بلند» در یک تابعِ نام‌دار، تا هم حلقهٔ اسکن و هم کنترلِ
   منفیِ پایین دقیقاً همین منطق را اجرا کنند (نه کپی‌ای از آن). ترتیبِ شرط‌ها
   معنادار است و دست‌نخورده مانده. */
function hexAllowed(f, line, hex) {
  if (/0x|digest|sha256|example|dummy|test|fixture|deadbeef/i.test(line)) return true;
  /* SPDX package checksums are public supply-chain integrity metadata,
     not credentials. Allow only the exact standardized checksum field;
     other long hexadecimal strings in documentation remain findings. */
  if (f === 'docs' + path.sep + 'SBOM.spdx.json' && /"checksumValue"\s*:\s*"$/.test(line)) return true;
  /* stats.json دیتاستِ ملی: همان الگو. T7d در tests/wave18-load-test.js
     «checksums» را در این فایل الزامی می‌داند و مقدارها sha256 خودِ
     فایل‌های CSVاند (با hash واقعی تطبیق داده شد)، نه کلید. فقط همان
     فیلد مجاز است؛ هر hex بلندی جایِ دیگر در این فایل همچنان هیت است. */
  if (/stats\.json$/.test(f) && /^\s*"[^"]+\.csv"\s*:\s*"$/.test(line)) return true;
  if (hexAllow[f]) return true;
  /* padding/dummy ثابت (مثلاً ۶۴ صفر برایِ timing-safe-equal) */
  if (/^(.)\1+$/.test(hex)) return true;
  return false;
}

for (const f of files) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(t))) {
      /* hex: فقط اگر شبیهِ ثابتِ کد (0x / digest نمونه) نباشد —
         خط را ببین و تصمیم بگیر؛ الگویِ hex فقط رویِ مقادیرِ متغیر
         (بعد از = / : / ') هشدار می‌دهد. */
      if (p.name.indexOf('long hex') > -1) {
        /* خطِ خودِ هیت (نه خطِ قبل) — آف‌بای‌وانِ قبلی فیلتر را روی خط اشتباه می‌سنجید */
        const line = t.slice(0, m.index).split('\n').pop() || '';
        if (hexAllowed(f, line, m[0])) continue;
      }
      const lineNo = t.slice(0, m.index).split('\n').length;
      hits++;
      console.log('   ⚠️  ' + f + ':' + lineNo + ' — ' + p.name + ': ' + m[0].slice(0, 24) + '…');
    }
  }
}
chk('هیچ اعتبارسنجی شناخته‌شده‌ای در فایل‌های پروژه نیست', hits === 0, hits + ' هیت');

/* ── کنترلِ منفی ─────────────────────────────────────────────────────────
   استثناهایِ «hex بلند» خطرناک‌اند: اگر زیاد فراگیر شوند، کلیدِ واقعی را هم
   می‌بلعند و اسکن بی‌صدا سبز می‌شود. این بررسی مستقیماً همان hexAllowed()
   را صدا می‌زند که حلقهٔ بالا استفاده می‌کند، پس استثنا را رویِ خودِ منطقِ
   زنده می‌سنجد، نه رویِ بازنویسیِ آن.

   نکته: نمونه‌ها عمداً واژه‌هایِ فیلترِ متنی (sha256/digest/example/test)
   ندارند؛ وگرنه شرطِ اول آن‌ها را می‌پوشاند و بررسی بی‌معنا می‌شد. */
const H64 = (a, b) => a.repeat(32) + b.repeat(32);   /* ۶۴ hex، یک‌نواخت نیست */
const HEXCASES = [
  /* [نامِ فایل، خط، مقدارِ hex، انتظارِ مجازبودن] */
  ['data/national/scale-0.001/stats.json', '    "schools.csv": "',   H64('a', 'b'), true,
    'فیلدِ checksum با پسوندِ .csv در stats.json'],
  ['data/national/scale-0.001/stats.json', '    "notes.txt": "',     H64('a', 'b'), false,
    'کلیدی که پسوندِ .csv ندارد در stats.json'],
  ['data/national/scale-0.001/stats.json', '    "api_secret": "',    H64('a', 'b'), false,
    'کلیدِ دلخواه در stats.json'],
  ['data/national/scale-0.001/stats.json', '    "schools.csv" : "',  H64('a', 'b'), true,
    'فاصلهٔ مجازِ JSON پیش ازِ دونقطه — قاعده \\s* دارد و باید بپذیرد'],
  ['data/national/scale-0.001/stats.json', '    "schools.csvx": "',  H64('a', 'b'), false,
    'پسوند باید دقیقاً .csv باشد، نه .csvx'],
  ['data/national/scale-0.001/stats.json', '    "schools.csv.bak": "', H64('a', 'b'), false,
    'پسوندِ .csv باید آخرین بخشِ نام باشد'],
  ['data/national/scale-0.001/stats.json', '    "schools.csv": "" + "', H64('a', 'b'), false,
    'مقدار بسته شده — دیگر فیلدِ بازِ checksum نیست'],
  ['data/national/scale-0.001/other.json', '    "schools.csv": "',   H64('a', 'b'), false,
    'همان شکل ولی در فایلی غیر از stats.json'],
  ['docs/NOTES.md',                        '    "schools.csv": "',   H64('a', 'b'), false,
    'همان شکل در مستندات'],
  ['docs/notes.md', '    "api_key": "',                              H64('a', 'b'), false,
    'hex بلندِ بی‌استثنا در مستندات'],
  ['docs/SBOM.spdx.json', '    "checksumValue": "',                  H64('a', 'b'), true,
    'فیلدِ استانداردِ SBOM'],
  ['docs/other.spdx.json', '    "checksumValue": "',                 H64('a', 'b'), false,
    'فیلدِ checksumValue بیرون از SBOM.spdx.json'],
  ['server/handler.js', 'const pad = "',                             '0'.repeat(64), true,
    'padding یک‌نواخت (timing-safe-equal)'],
  ['server/handler.js', 'const key = "',                             H64('a', 'b'), false,
    'کلیدِ واقعیِ ۶۴ hex در کد']
];
let hexBad = 0;
for (const [f, line, hex, want, label] of HEXCASES) {
  const got = hexAllowed(f, line, hex);
  if (got !== want) {
    hexBad++;
    console.log('   ⚠️  کنترلِ منفی: ' + label + ' → انتظار ' + want + '، دریافت ' + got
      + '  [' + f + ']');
  }
}
chk('کنترلِ منفیِ استثناهایِ hex: فقط مقادیرِ مجاز پذیرفته می‌شوند',
  hexBad === 0, hexBad + ' مورد از ' + HEXCASES.length + ' خطا');


console.log('');
console.log('— پوششِ .gitignore —');
const giPath = path.join(ROOT, '.gitignore');
const gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
chk('.gitignore موجود است', gi.length > 0);
const needs = ['.env', '.env*', '*.pem', '*.key', '*.crt', 'jwt.key', 'secrets'];
for (const n of needs) {
  chk('.gitignore شامل «' + n + '»', new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(gi));
}
chk('JWT key (server/data/jwt.key) git-ignored', /jwt\.key|data\/jwt/.test(gi));
chk('فایلِ data/jwt.key در repository track نشده', !gitTracked('server/data/jwt.key'));

function gitTracked(rel) {
  try {
    const out = require('child_process').execSync('git ls-files -- ' + JSON.stringify(rel), { cwd: ROOT }).toString().trim();
    return out.length > 0;
  } catch (e) { return false; }
}

console.log('');
console.log('────────────────────────────────────────────────────');
if (fail === 0) console.log('secret-scan: ' + pass + '/' + pass + ' سبز ✅');
else {
  console.log('secret-scan: ' + pass + ' سبز / ' + fail + ' قرمز ❌');
  for (const e of errors) console.log('   ' + e);
  process.exit(1);
}
