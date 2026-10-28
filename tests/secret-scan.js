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
const { execFileSync } = require('child_process');

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
  { name: 'Session JWT cookie (payesh_session)', re: /\bpayesh_session=eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'long hex (≥64) — کاندیدای کلید', re: /\b[0-9a-fA-F]{64,}\b/g },
  { name: 'Bearer/Authorization hardcoded', re: /Authorization['"]?\s*[:=]\s*['"][A-Za-z0-9._-]{16,}/g },
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
const CANONICAL_ALERT_RULES = path.join(ROOT, 'infra/observability/alert-rules.yml');
chk('canonical observability alert rules are readable', fs.existsSync(CANONICAL_ALERT_RULES) && fs.statSync(CANONICAL_ALERT_RULES).isFile());
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
const CREDENTIAL_KEY_RE = /\b(?:secret|token|password|passwd|cookie|authorization|bearer|private[ _-]?key|api[ _-]?key|session)\b/i;
function hexAllowed(f, line, hex, fullLine) {
  const normFile = String(f || '').split('\\').join('/');
  const whole = fullLine === undefined ? String(line || '') + String(hex || '') : String(fullLine);
  /* ── SI-013-B (mission 2): the blanket keyword exemption was a blind spot.
     The previous line here was
       if (/0x|digest|sha256|example|dummy|test|fixture|deadbeef/i.test(line)) return true;
     i.e. any line that merely *mentioned* "test", "example" or "fixture" ANYWHERE excused a
     64-hex value. Measured on this tree before the fix: appending
     `const testApiKey = "<fresh random 64 hex>"` to a doc still printed `13/13 سبز`.
     A label only excuses the value it labels, and only for the words that actually denote a
     digest -- the ambiguous words ("test", "fixture", "example", "dummy") are gone, so they
     can no longer be borrowed by a planted key. The keyword near the value is not by itself
     enough for files the explicit rules above reject: those run first. */
  const tail = String(line).slice(-70);
  /* No leading \b: labels are commonly glued to an underscore ("lockfile_sha256",
     "before_sha256"), and a word boundary there would skip exactly the labels we mean. */
  if (/sha-?256|sha-?512|digest|0x|deadbeef/i.test(tail)) return true;
  /* SPDX package checksums are public supply-chain integrity metadata,
     not credentials. Allow only the exact standardized checksum field;
     other long hexadecimal strings in documentation remain findings. */
  if (normFile === 'docs/SBOM.spdx.json' && /"checksumValue"\s*:\s*"$/.test(line)) return true;
  /* SI-013 Option A: verified 64-char lowercase SHA-256 backup/file integrity
     checksums inside archived DR evidence JSON (`\"checksum\": \"<sha256>\"`)
     and FT-METRIC-01 verification ledgers. Never permits credentials, cookies,
     non-64-char hex, or production/source paths. */
  if (/^[0-9a-f]{64}$/.test(hex) && !CREDENTIAL_KEY_RE.test(whole)) {
    if (/^docs\/arena-evidence\/.+\.json$/.test(normFile) && /\\"checksum\\"\s*:\s*\\"$/.test(line)) return true;
    /* SI-013-B: the ledgers also hash `mutation-test.sh` and the partial-report JSON.
       Those tables were previously excused only by the word "test" inside
       "mutation-test.sh", i.e. by the blind spot; they are named here instead. */
    if (/^tools\/ft\/FT-METRIC-01-[A-Za-z0-9-]+\.md$/.test(normFile)
        && /(?:metric-v2(?:\.test)?\.js|benchmark\.js|mutation-test\.sh|metric-v2-partial-report\.json|source (?:hash|untouched))/.test(whole)) return true;
  }
  /* stats.json دیتاستِ ملی: همان الگو. T7d در tests/wave18-load-test.js
     «checksums» را در این فایل الزامی می‌داند و مقدارها sha256 خودِ
     فایل‌های CSVاند (با hash واقعی تطبیق داده شد)، نه کلید. فقط همان
     فیلد مجاز است؛ هر hex بلندی جایِ دیگر در این فایل همچنان هیت است. */
  if (/stats\.json$/.test(normFile) && /^\s*"[^"]+\.csv"\s*:\s*"$/.test(line)) return true;
  if (hexAllow[f] || hexAllow[normFile]) return true;
  /* padding/dummy ثابت (مثلاً ۶۴ صفر برایِ timing-safe-equal) */
  if (/^(.)\1+$/.test(hex)) return true;
  /* Narrow, documented, file+field-specific exception: the ARENA6 audit report quotes the
     `PAYESH_JWT_SECRET=` value it found at `.env.example:38` as the evidence of its own
     finding. That file is historical evidence and is not rewritten (preserve cycle logs).
     Whether that value is still live is the SI-013 rotation question -- the owner's -- so
     this names the exact file and field instead of passing the whole file. */
  if (normFile === 'docs/audit/ARENA6_SECURITY_AUDIT_REPORT_ecc8b40b.md'
      && /PAYESH_JWT_SECRET=/.test(whole)) return true;
  return false;
}

for (const f of files) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const allLines = t.split('\n');
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(t))) {
      const lineNo = t.slice(0, m.index).split('\n').length;
      /* hex: فقط اگر شبیهِ ثابتِ کد (0x / digest نمونه) نباشد —
         خط را ببین و تصمیم بگیر؛ الگویِ hex فقط رویِ مقادیرِ متغیر
         (بعد از = / : / ') هشدار می‌دهد. */
      if (p.name.indexOf('long hex') > -1) {
        /* خطِ خودِ هیت (نه خطِ قبل) — آف‌بای‌وانِ قبلی فیلتر را روی خط اشتباه می‌سنجید */
        const line = t.slice(0, m.index).split('\n').pop() || '';
        const fullLine = allLines[lineNo - 1] || '';
        if (hexAllowed(f, line, m[0], fullLine)) continue;
      }
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
    'کلیدِ واقعیِ ۶۴ hex در کد'],
  ['docs/arena-evidence/2026-09-25/arena8-dr/evidence/metadata1.json', '  "stdout": "{\\"checksum\\": \\"', H64('a', 'b'), true,
    'SI-013 مثبت: فیلدِ checksum درونِ شواهدِ آرشیویِ DR'],
  ['docs/arena-evidence/2026-09-25/arena8-dr/evidence/metadata1.json', '  "stdout": "{\\"api_key\\": \\"', H64('a', 'b'), false,
    'SI-013 منفی: کلیدِ api_key درونِ docs/arena-evidence همچنان رد می‌شود'],
  ['docs/arena-evidence/2026-09-25/arena8-dr/evidence/metadata1.json', '  "stdout": "{\\"token\\": \\"', H64('a', 'b'), false,
    'SI-013 منفی: کلیدِ token درونِ docs/arena-evidence همچنان رد می‌شود'],
  ['docs/arena-evidence/2026-09-25/arena8-dr/evidence/metadata1.json', '  "stdout": "{\\"checksum\\": \\"', H64('a', 'b') + '0', false,
    'SI-013 منفی: رشتهٔ ۶۵ کاراکتری (غیر از SHA-256 دقیق) رد می‌شود'],
  ['server/handler.js', '  const s = "{\\"checksum\\": \\"',         H64('a', 'b'), false,
    'SI-013 منفی: همان شکلِ checksum درونِ کدِ تولید رد می‌شود'],
  ['tools/ft/FT-METRIC-01-VERIFICATION-PACKAGE.md', '| `tools/ft/metric-v2.js` | `', H64('a', 'b'), true,
    'SI-013 مثبت: هشِ فایلِ metric-v2.js در بستهٔ راستی‌آزماییِ FT-METRIC-01'],
  ['tools/ft/FT-METRIC-01-VERIFICATION-PACKAGE.md', 'api_secret = ', H64('a', 'b'), false,
    'SI-013 منفی: مقدارِ رازگونه درونِ tools/ft همچنان رد می‌شود'],
  ['tools/ft/other.js', '| `tools/ft/metric-v2.js` | `',             H64('a', 'b'), false,
    'SI-013 منفی: فایلِ اجراییِ جاوااسکریپت درونِ tools/ft مستثنا نیست'],
  /* ── SI-013-B: the keyword exemption must not be borrowable by a planted key.
     These four are the regression locks for the hole measured in mission 2: with the old
     rule, `const testApiKey = "<64 hex>"` was silently accepted (13/13 green). A value is
     excused only by a digest label next to it, never by the word "test" on the line. */
  ['docs/NOTES.md', 'const testApiKey = "',                          H64('a', 'b'), false,
    'SI-013-B منفی: نامِ متغیرِ حاویِ test کلیدِ ۶۴hex را نمی‌پوشاند'],
  ['docs/NOTES.md', 'const fixtureToken = "',                        H64('a', 'b'), false,
    'SI-013-B منفی: واژهٔ fixture در نامِ متغیر پوشش نیست'],
  ['tests/fixtures/sample.js', 'module.exports.dummy = "',            H64('a', 'b'), false,
    'SI-013-B منفی: حتی در فایلِ fixture خودِ مخزن، dummy پوشش نیست'],
  ['docs/NOTES.md', '- seal: `sha256:',                               H64('a', 'b'), true,
    'SI-013-B مثبت: برچسبِ sha256 چسبیده به مقدار همچنان مجاز است'],
  ['docs/NOTES.md', '  "lockfile_sha256": "',                        H64('a', 'b'), true,
    'SI-013-B مثبت: برچسبِ چسبیده با آندرلاین هم مجاز است']
];
let hexBad = 0;
for (const [f, line, hex, want, label] of HEXCASES) {
  const got = hexAllowed(f, line, hex, line + hex);
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
    const out = execFileSync('git', ['ls-files', '--', rel], { cwd: ROOT }).toString().trim();
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
