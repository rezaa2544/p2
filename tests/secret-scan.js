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

/* S7-9 (باگ‌هانت چت ۵، نشست ۷): پیش‌تر فقط یک فهرستِ بستهٔ پسوند اسکن
   می‌شد (.js/.json/.html/.md/.env/.sh/.yml/.yaml) و هر چیزِ دیگری — از جمله
   اسکریپت‌های PowerShell/Cmd، فایل‌های .txt/.toml/.ini/.sql/.py — از دیدِ
   اسکنر بیرون بود. یک توکنِ زنده در `setup-deps.ps1` دقیقاً از همین سوراخ
   رد شده بود (گیت ۱۱/۱۱ سبز بود). سیاستِ تازه: هر فایلِ متنی اسکن می‌شود؛
   فقط باینری‌های شناخته‌شده و فایل‌های بزرگ‌تر از ۲ مگابایت کنار می‌روند. */
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svgz',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.tgz', '.tar', '.bz2', '.xz', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.wav', '.webm', '.ogg', '.flac',
  '.exe', '.dll', '.so', '.dylib', '.node', '.bin', '.wasm', '.pyc', '.class', '.jar', '.db', '.sqlite', '.sqlite3'
]);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.git')) continue;
      if (SKIP_PATHS.has(path.relative(ROOT, path.join(dir, e.name)))) continue;
      walk(path.join(dir, e.name), out);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (SKIP_EXT.has(ext)) continue;
      const abs = path.join(dir, e.name);
      let size = Infinity;
      try { size = fs.statSync(abs).size; } catch (err) { continue; }
      if (size > MAX_SCAN_BYTES) continue;
      out.push(path.relative(ROOT, abs));
    }
  }
}

const files = [];
walk(ROOT, files);
console.log('');
console.log('— اسکنِ ' + files.length + ' فایل —');
let hits = 0;
const hexAllow = { 'build.js': 1, 'server/tls-cert.js': 1, 'server/seed.js': 1, 'tests/tls-self.js': 1 };
/* S7-9: `.env.example` تنها جایِ مجازِ «نمونهٔ» راز است (فایلِ الگو است، نه
   پیکربندیِ واقعی) — و آن‌هم فقط برای الگویِ hex؛ توکنِ واقعی حتی در فایلِ
   نمونه هم قابل‌قبول نیست. */
const FILE_ALLOW = { '.env.example': { 'long hex (≥64) — کاندیدای کلید': 1 } };
for (const f of files) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    if (FILE_ALLOW[f] && FILE_ALLOW[f][p.name]) continue; /* نمونهٔ مستند، نه راز */
    while ((m = p.re.exec(t))) {
      /* hex: فقط اگر شبیهِ ثابتِ کد (0x / digest نمونه) نباشد —
         خط را ببین و تصمیم بگیر؛ الگویِ hex فقط رویِ مقادیرِ متغیر
         (بعد از = / : / ') هشدار می‌دهد. */
      if (p.name.indexOf('long hex') > -1) {
        /* خطِ خودِ هیت (نه خطِ قبل) — آف‌بای‌وانِ قبلی فیلتر را روی خط اشتباه می‌سنجید */
        const line = t.slice(0, m.index).split('\n').pop() || '';
        if (/0x|digest|sha256|example|dummy|test|fixture|deadbeef/i.test(line)) continue;
        /* SPDX package checksums are public supply-chain integrity metadata,
           not credentials. Allow only the exact standardized checksum field;
           other long hexadecimal strings in documentation remain findings. */
        if (f === 'docs' + path.sep + 'SBOM.spdx.json' && /"checksumValue"\s*:\s*"$/.test(line)) continue;
        if (hexAllow[f]) continue;
        /* padding/dummy ثابت (مثلاً ۶۴ صفر برایِ timing-safe-equal) */
        if (/^(.)\1+$/.test(m[0])) continue;
      }
      const lineNo = t.slice(0, m.index).split('\n').length;
      hits++;
      console.log('   ⚠️  ' + f + ':' + lineNo + ' — ' + p.name + ': ' + m[0].slice(0, 24) + '…');
    }
  }
}
chk('هیچ اعتبارسنجی شناخته‌شده‌ای در فایل‌های پروژه نیست', hits === 0, hits + ' هیت');
/* S7-9: خودسنجیِ دامنه — کلاس‌هایی که پیش‌تر بیرونِ فهرستِ پسوند بودند باید
   حالا در دامنه باشند؛ وگرنه گیت بی‌صدا عقب می‌رود. */
{
  const inScope = (rel) => files.indexOf(rel) >= 0;
  const scopeNeeds = ['setup-deps.ps1', 'package-lock.json', 'build.js'];
  const missing = scopeNeeds.filter((f) => !inScope(f));
  chk('دامنهٔ اسکن اسکریپت‌های غیر-JS را پوشش می‌دهد (ps1/lockfile)', missing.length === 0, 'خارج: ' + missing.join(', ') || '—');
  const idxHtml = files.filter((f) => /\.(html|md|sh)$/.test(f)).length;
  chk('اسکنِ متنی وسعت دارد (≥۱۵۰ فایلِ html/md/sh)', idxHtml >= 150, 'یافت‌شده: ' + idxHtml);
}

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
