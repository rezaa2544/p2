#!/usr/bin/env node
// tools/openapi-validate.js — اعتبارسنجی مشخصات اوپن‌ای‌پی‌آی (مأموریت ۳۶، چت ۶)
// سه سطح: کامل (swagger-parser) ← ساختاری (js-yaml) ← پایه (بررسی متنی).
// هیچ وابستگی‌ای برای اجرا «الزامی» نیست — سندباکس ممکن است بدون node_modules باشد.
'use strict';
const fs = require('fs');
const path = require('path');
const SPEC = path.join(__dirname, '..', 'docs', 'openapi.yaml');

let pass = 0, fail = 0;
const chk = (name, ok) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
};

const text = fs.readFileSync(SPEC, 'utf8');
console.log('■ اعتبارسنجی ' + path.relative(process.cwd(), SPEC));

let doc = null, level = 'پایه';
try {
  const yaml = require('js-yaml');
  doc = yaml.load(text);
  level = 'ساختاری (js-yaml)';
} catch (e) {
  console.log('  ⚠️ js-yaml در دسترس نیست — بررسی متنی/ساختاری انجام می‌شود');
}

async function full() {
  try {
    const SwaggerParser = require('@apidevtools/swagger-parser');
    await SwaggerParser.validate(SPEC);
    console.log('■ سطح کامل: اعتبارسنجی سراسری با @apidevtools/swagger-parser موفق بود');
    level = 'کامل (سراسری)';
    return true;
  } catch (e) {
    console.log('  ❌ اعتبارسنجی کامل شکست خورد: ' + e.message);
    return false;
  }
}

(async () => {
  if (doc) {
    const okFull = await full();
    chk('اعتبارسنجی کامل (ارجاع‌ها + ساختار)', okFull);
    chk('نسخهٔ اوپن‌ای‌پی‌آی 3.0', String(doc.openapi || '').startsWith('3.0'));
    chk('info.title/version موجود', !!(doc.info && doc.info.title && doc.info.version));
    chk('دست‌کم یک سرور', Array.isArray(doc.servers) && doc.servers.length >= 1);
    chk('مسیرها تعریف شده‌اند', !!doc.paths && Object.keys(doc.paths).length >= 25);
    chk('securitySchemes: cookieAuth + csrfToken', !!(doc.components && doc.components.securitySchemes && doc.components.securitySchemes.cookieAuth && doc.components.securitySchemes.csrfToken));
    const ops = Object.values(doc.paths).reduce((n, p) => n + ['get', 'post', 'put', 'delete', 'patch'].filter((m) => p[m]).length, 0);
    chk('شمار عملیات‌ها = ۳۱ (منطبق با کد)', ops === 31);
    const tags = (doc.tags || []).map((t) => t.name);
    for (const t of ['auth', 'students', 'teachers', 'classes', 'grades', 'attendance', 'sync', 'library', 'assets', 'visitors', 'summer', 'feedback', 'admin', 'observability']) {
      chk('تگ «' + t + '»', tags.includes(t));
    }
    chk('اسکیمای خطا (Error)', !!(doc.components.schemas && doc.components.schemas.Error));
    chk('پاسخ‌های بازمصرف ≥ ۸', Object.keys(doc.components.responses || {}).length >= 8);
    chk('پارامترهای بازمصرف ≥ ۴', Object.keys(doc.components.parameters || {}).length >= 4);
    chk('دست‌کم یک مثال', Object.keys(doc.components.examples || {}).length >= 1);
  } else {
    // سطح پایه — بررسی متنی
    chk('کلید openapi: 3.0', /openapi:\s*["']?3\.0/.test(text));
    chk('کلیدهای اصلی', /(^|\n)info:/.test(text) && /(^|\n)paths:/.test(text) && /(^|\n)components:/.test(text));
    const wanted = ['/api/auth/send-code', '/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/delete-account',
      '/api/sync:', '/api/sync/conflicts', '/api/sync/resolve-conflict', '/api/bell/now', '/api/public-report',
      '/api/admin/backup', '/api/admin/restore', '/api/sms/send', '/api/liveness', '/api/readiness', '/api/health:',
      '/api/health-index', '/api/__slow', '/api/v1/bootstrap', '/api/v1/pull', '/api/v1/students', '/api/v1/classes',
      '/api/v1/attendance', '/api/v1/grades', '/api/v1/users'];
    for (const w of wanted) chk('مسیر ' + w, text.includes(w));
    chk('securitySchemes', text.includes('cookieAuth:') && text.includes('csrfToken:'));
  }
  console.log(`\nسطح اعتبارسنجی: ${level} — نتیجه: ${pass} موفق / ${fail} ناموفق (از ${pass + fail})`);
  process.exit(fail ? 1 : 0);
})();
