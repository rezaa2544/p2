#!/usr/bin/env node
// tools/config-audit.js — مغایرت‌یابی متغیرهای محیطی بین کد و مرجع پیکربندی
// مأموریت ۳۷، چت ۶. منبع حقیقت: کد. خروجی ۰ = صفر مغایرت.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── استخراج از کد ──
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'data') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.sh'))) out.push(p);
  }
  return out;
}
const codeFiles = [...walk(path.join(ROOT, 'server'), []), ...walk(path.join(ROOT, 'tools'), [])];
const codeVars = new Set();
const shLocalsFile = new Set();
const RE_ENV = /\bprocess\.env\.([A-Z_][A-Z0-9_]*)/g;
// الگوی `env.` برای فایل‌هایی که `const env = process.env` دارند
const ENV_ALIAS_FILES = ['server/tracing.js', 'server/redis.js'].map((f) => path.join(ROOT, f));
const RE_ALIAS = /\benv\.([A-Z_][A-Z0-9_]*)/g;
for (const f of codeFiles) {
  const t = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = RE_ENV.exec(t)) !== null) codeVars.add(m[1]);
  if (ENV_ALIAS_FILES.includes(f)) {
    while ((m = RE_ALIAS.exec(t)) !== null) codeVars.add(m[1]);
  }
  if (f.endsWith('.sh')) {
    const RE_SH = /\$\{([A-Z_][A-Z0-9_]*):-/g;  // فقط الگوی «پیش‌فرض‌دار» = واقعاً از محیط خوانده می‌شود
    while ((m = RE_SH.exec(t)) !== null) codeVars.add(m[1]);
    // ── فیلترِ مثبت‌های کاذب (M2/M3/M-RC44 چت ۶) ──
    const RE_SH_ASSIGN = /^[ \t]*(?:export[ \t]+)?([A-Z_][A-Z0-9_]*)[ \t]*=/gm;
    let a;
    while ((a = RE_SH_ASSIGN.exec(t)) !== null) {
      const ls = t.lastIndexOf('\n', a.index) + 1;
      const le = t.indexOf('\n', a.index);
      const line = t.slice(ls, le === -1 ? t.length : le);
      if (!/^\s*export\s/.test(line)) shLocalsFile.add(a[1]);
    }
  }
}
// متغیرهای محلی اسکریپت‌های تست (با الگوی پیش‌فرض‌دار دیده می‌شوند ولی ورودی محیطی نیستند)
const SH_LOCALS = new Set(['BAD', 'NEW', 'TARGET']);

// ── استخراج از سند (ستون اول جدول‌های §۲) ──
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'CONFIGURATION_REFERENCE.md'), 'utf8');
const s2 = doc.slice(doc.indexOf('## ۲) متغیرهای محیطی'), doc.indexOf('## ۳)'));
const docVars = new Set();
for (const line of s2.split('\n')) {
  if (!line.startsWith('|')) continue;
  const first = line.split('|')[1] || '';
  for (const bt of first.split('·')) {
    const m = bt.match(/`([A-Z_][A-Z0-9_]*)`/);
    if (m) docVars.add(m[1]);
  }
}

// ── مقایسه ──
const inCodeNotDoc = [...codeVars].filter((v) => !docVars.has(v) && !shLocalsFile.has(v)).sort();
const inDocNotCode = [...docVars].filter((v) => !codeVars.has(v)).sort();

console.log('■ ممیزی پیکربندی — کد در برابر مرجع');
console.log('متغیرهای کد: ' + codeVars.size + ' · متغیرهای سند (§۲): ' + docVars.size);
const shown = inCodeNotDoc.filter((v) => !SH_LOCALS.has(v));
if (shown.length) {
  console.log('\n❌ در کد هست ولی در سند نیست:');
  shown.forEach((v) => console.log('  - ' + v));
}
if (inDocNotCode.length) {
  console.log('\n⚠️ در سند هست ولی در کد پیدا نشد (فقط-زیرساخت بودن را تأیید کنید):');
  inDocNotCode.forEach((v) => console.log('  - ' + v));
}
const inCodeNotDoc2 = inCodeNotDoc.filter((v) => !SH_LOCALS.has(v));
if (!inCodeNotDoc2.length) {
  console.log('\n✅ هیچ متغیر کدی بی‌سند نیست.');
}
process.exit(inCodeNotDoc2.length ? 1 : 0);
