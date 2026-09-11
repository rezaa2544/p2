#!/usr/bin/env node
// tests/openapi-spec.js — پوشش مشخصات اوپن‌ای‌پی‌آی (مأموریت ۳۶، چت ۶)
// قرارداد ابلاغی: ساختار ۳.۰.۳ + ۱۴ تگ + همهٔ مسیرهای ای‌پی‌آی + اسکیمای امنیتی/خطا/مثال.
// وابستگی به js-yaml نرم است: بدون آن، بررسی ساختاری متنی اجرا می‌شود (قید صادقانه).
'use strict';
const fs = require('fs');
const path = require('path');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n■ ' + t); }
function chk(name, ok) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}

const SPEC = path.join(__dirname, '..', 'docs', 'openapi.yaml');
chk('فایل اسپک وجود دارد', fs.existsSync(SPEC));
if (!fs.existsSync(SPEC)) process.exit(1);
const text = fs.readFileSync(SPEC, 'utf8');

let doc = null;
try { doc = require('js-yaml').load(text); } catch (e) { /* fallback structural */ }

grp('ساختار پایه');
if (doc) {
  chk('نسخهٔ ۳.۰.۳', doc.openapi === '3.0.3');
  chk('عنوان و نسخه', !!(doc.info && doc.info.title && doc.info.version === '1.0.0'));
  chk('توضیح + تماس + پروانه', !!(doc.info.description && doc.info.contact && doc.info.license));
  chk('دو سرور (تولید/استیجینگ)', Array.isArray(doc.servers) && doc.servers.length === 2);
} else {
  console.log('  ⚠️ js-yaml نصب نیست — بررسی ساختاری متنی');
  chk('نسخهٔ ۳.۰.۳', text.includes('openapi: 3.0.3'));
  chk('عنوان و نسخه', text.includes('title:') && text.includes('version: 1.0.0'));
  chk('دو سرور', (text.match(/- url:/g) || []).length === 2);
}

grp('تگ‌ها (۱۴ تگ ابلاغی)');
const TAGS = ['auth', 'students', 'teachers', 'classes', 'grades', 'attendance', 'sync', 'library', 'assets', 'visitors', 'summer', 'feedback', 'admin', 'observability'];
if (doc) {
  const have = (doc.tags || []).map((t) => t.name);
  chk('۱۴ تگ تعریف شده', have.length === 14);
  for (const t of TAGS) chk('تگ «' + t + '»', have.includes(t));
} else {
  for (const t of TAGS) chk('تگ «' + t + '»', new RegExp('name: ' + t + '\\b').test(text));
}

grp('مسیرها — ۲۹ مسیر ای‌پی‌آی + ۲ کشف‌شده از کد (۳۱ عملیات)');
// ۲۹ مسیر طبق موجودی §۴ ای‌پی‌آی‌چنج‌لاگ + /api/health-index و /metrics که در کد هستند
const OPS = [
  ['post', '/api/auth/send-code'], ['post', '/api/auth/login'], ['get', '/api/auth/me'],
  ['post', '/api/auth/logout'], ['post', '/api/auth/delete-account'],
  ['post', '/api/sync'], ['get', '/api/sync/conflicts'], ['post', '/api/sync/resolve-conflict'],
  ['get', '/api/bell/now'], ['get', '/api/public-report'],
  ['post', '/api/admin/backup'], ['post', '/api/admin/restore'], ['post', '/api/sms/send'],
  ['get', '/api/liveness'], ['get', '/api/readiness'], ['get', '/api/health'],
  ['get', '/api/__slow'],
  ['get', '/api/v1/bootstrap'], ['get', '/api/v1/pull'],
  ['get', '/api/v1/students'], ['post', '/api/v1/students'],
  ['get', '/api/v1/classes'], ['post', '/api/v1/classes'],
  ['get', '/api/v1/attendance'], ['post', '/api/v1/attendance'],
  ['get', '/api/v1/grades'], ['post', '/api/v1/grades'],
  ['get', '/api/v1/users'], ['post', '/api/v1/users'],
  ['get', '/api/health-index'], ['get', '/metrics'],
];
if (doc) {
  let total = 0;
  for (const [method, p] of OPS) {
    const ok = !!(doc.paths && doc.paths[p] && doc.paths[p][method]);
    chk(method.toUpperCase() + ' ' + p, ok);
  }
  for (const p of Object.values(doc.paths || {})) total += ['get', 'post', 'put', 'delete', 'patch'].filter((mth) => p[mth]).length;
  chk('جمع عملیات‌ها = ۳۱', total === 31);
  // هر عملیات: تگ + پاسخ دارد
  let opsWithTag = 0, opsWithResp = 0, n = 0;
  for (const p of Object.values(doc.paths || {})) {
    for (const mth of ['get', 'post', 'put', 'delete', 'patch']) {
      if (!p[mth]) continue; n++;
      if (Array.isArray(p[mth].tags) && p[mth].tags.length) opsWithTag++;
      if (p[mth].responses && Object.keys(p[mth].responses).length) opsWithResp++;
    }
  }
  chk('همهٔ عملیات‌ها تگ دارند (' + fa(n) + ')', opsWithTag === n);
  chk('همهٔ عملیات‌ها پاسخ دارند', opsWithResp === n);
} else {
  for (const [, p] of OPS) chk('مسیر ' + p, text.includes(p + ':'));
}

grp('امنیت');
if (doc) {
  const ss = (doc.components || {}).securitySchemes || {};
  chk('cookieAuth (نشست کوکی)', !!(ss.cookieAuth && ss.cookieAuth.in === 'cookie'));
  chk('csrfToken', !!ss.csrfToken);
  chk('metricsToken برای /metrics', !!ss.metricsToken);
  chk('امنیت سراسری کوکی', Array.isArray(doc.security) && doc.security.length >= 1);
  const login = doc.paths['/api/auth/login'];
  chk('ورود/او‌تی‌پی عمومی‌اند (security: [])', Array.isArray(login.post.security) && login.post.security.length === 0);
  const me = doc.paths['/api/auth/me'];
  chk('نشست فعلی کوکی می‌خواهد', JSON.stringify(me.get.security).includes('cookieAuth'));
} else {
  chk('securitySchemes', text.includes('cookieAuth:') && text.includes('csrfToken:') && text.includes('metricsToken:'));
}

grp('کامپوننت‌ها');
if (doc) {
  const c = doc.components || {};
  const schemas = Object.keys(c.schemas || {});
  for (const s of ['Error', 'Ok', 'User', 'Student', 'Teacher', 'ClassRoom', 'Grade', 'AttendanceRecord', 'Session', 'SyncPushRequest', 'SyncPushResult', 'ConflictList', 'DeltaPull', 'Bootstrap', 'HealthStatus', 'HealthIndex', 'PageMeta']) {
    chk('اسکیمای ' + s, schemas.includes(s));
  }
  const res = Object.keys(c.responses || {});
  for (const r of ['BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 'Conflict', 'TooManyRequests', 'InternalError', 'ServiceUnavailable']) {
    chk('پاسخ بازمصرف ' + r, res.includes(r));
  }
  const prm = Object.keys(c.parameters || {});
  for (const q of ['Page', 'Limit', 'Cursor', 'SchoolScope', 'IfMatch']) {
    chk('پارامتر بازمصرف ' + q, prm.includes(q));
  }
  chk('مثال‌ها ≥ ۲ و دارای مقدار', Object.keys(c.examples || {}).length >= 2 && Object.values(c.examples).every((e) => e && e.value));
  chk('اسکیمای دانش‌آموز فیلد سنگ‌قبر دارد', !!(c.schemas.Student.properties.deleted_at));
  chk('او‌سی‌سی در پارامتر If-Match', !!(c.parameters.IfMatch && c.parameters.IfMatch.name === 'If-Match'));
} else {
  for (const s of ['Error:', 'User:', 'Student:', 'DeltaPull:', 'HealthIndex:']) chk('اسکیمای ' + s, text.includes(s));
}

grp('پاسخ‌های خطا در مسیرها');
for (const code of ['400', '401', '403', '404', '409', '429', '500', '503']) {
  chk('کد ' + code + ' در اسپک استفاده شده', text.includes("'" + code + "':") || text.includes('"' + code + '":') || text.includes(code + ': {'));
}

grp('پاکیزگی');
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(text));
chk('بدون نشانی لوکال‌هاست به‌عنوان سرور رسمی', !/url: https?:\/\/(localhost|127\.0\.0\.1)/.test(text));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
