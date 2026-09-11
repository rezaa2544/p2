#!/usr/bin/env node
// tools/openapi-drift.js — مقایسهٔ مسیرهای واقعی سرور با مشخصات اوپن‌ای‌پی‌آی
// مأموریت ۳۶، چت ۶. منبع حقیقت: کد (server/index.js). خروجی = دو فهرست مغایرت.
// خروجی ۰ یعنی صفر دریفت.
'use strict';
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'server', 'index.js');
const SPEC = path.join(__dirname, '..', 'docs', 'openapi.yaml');

// ── استخراج مسیرها از کد: الگوی `p === '/api/...' && req.method === 'X'` ──
const code = fs.readFileSync(INDEX, 'utf8');
const codeRoutes = new Map(); // "METHOD /path" -> true
const re = /p\s*===\s*'([^']+)'\s*(?:&&|\|\|)[^\n]*?req\.method\s*===\s*'(GET|POST|PUT|DELETE|PATCH|HEAD)'/g;
let m;
while ((m = re.exec(code)) !== null) {
  const p = m[1], method = m[2] === 'HEAD' ? 'GET' : m[2];
  codeRoutes.set(method + ' ' + p, true);
}
// الگوی جفت: `(req.method === 'GET' || req.method === 'HEAD')` بعد از مقایسهٔ مسیر
const re2 = /p\s*===\s*'([^']+)'\s*&&\s*\(req\.method\s*===\s*'(GET|POST)'\s*\|\|\s*req\.method\s*===\s*'HEAD'\)/g;
while ((m = re2.exec(code)) !== null) codeRoutes.set(m[2] + ' ' + m[1], true);

// ── استخراج مسیرها از اسپک (بدون وابستگی: پیمایش متنی کلیدهای مسیر) ──
const spec = fs.readFileSync(SPEC, 'utf8');
const specRoutes = new Map();
let curPath = null;
for (const line of spec.split('\n')) {
  const pm = line.match(/^  (\/[^:]+):\s*$/);
  if (pm) { curPath = pm[1]; continue; }
  const om = line.match(/^    (get|post|put|delete|patch):\s*$/);
  if (om && curPath) specRoutes.set(om[1].toUpperCase() + ' ' + curPath, true);
}

// ── مقایسه ──
const inCodeNotSpec = [...codeRoutes.keys()].filter((k) => !specRoutes.has(k)).sort();
const inSpecNotCode = [...specRoutes.keys()].filter((k) => !codeRoutes.has(k)).sort();

console.log('■ دریفت اوپن‌ای‌پی‌آی — کد در برابر اسپک');
console.log('مسیرهای کد: ' + codeRoutes.size + ' · مسیرهای اسپک: ' + specRoutes.size);
if (inCodeNotSpec.length) {
  console.log('\n❌ در کد هست ولی در اسپک نیست:');
  inCodeNotSpec.forEach((r) => console.log('  - ' + r));
}
if (inSpecNotCode.length) {
  console.log('\n❌ در اسپک هست ولی در کد نیست:');
  inSpecNotCode.forEach((r) => console.log('  - ' + r));
}
if (!inCodeNotSpec.length && !inSpecNotCode.length) {
  console.log('\n✅ صفر دریفت — اسپک با کد همگام است (' + specRoutes.size + ' عملیات).');
  process.exit(0);
}
process.exit(1);
