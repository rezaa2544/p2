#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave15-child — فرزندِ جدا برایِ سناریوهایِ Wave 15 که process واقعی
   و سیگنال واقعی می‌خواهند (الگویِ server11-child):
     mode shutdown     : استارت + صبر برایِ SIGTERM → handlerِ خودِ ماژول
                         باید drain کند و exit(0) با خطوط [shutdown]
     mode drain        : همان، + PAYESH_TEST_SLOW_MS=1500 برایِ یک
                         درخواستِ طولانی که باید در حینِ drain کامل شود
     mode prod-noredis : PAYESH_ENV=production + NODE_ENV=production +
                         REDIS_URL روی پورتِ مرده ⇒ P0-13 باید fail-fast
                         کند (exit 1 + خط [FATAL]) — نه استارت
   استدعا: node tests/wave15-child.js <root> <mode>
   خروجی: READY:<port> و خطوطِ سرور (stdout) / [FATAL] (stderr)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = process.argv[2];
const MODE = process.argv[3] || 'shutdown';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w15-'));
const REAL = path.join(ROOT, 'server', 'data', 'payesh.json');
if(!fs.existsSync(REAL)){
  console.log('STORE_MISSING');
  process.exit(2);
}
const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(REAL, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'key');
process.env.PAYESH_DEMO_CODE = '1';
/* env از والد ارث می‌رود — اول پاک، بعدِ طبقِ mode */
delete process.env.PAYESH_TEST_SLOW_MS;
delete process.env.PAYESH_SHUTDOWN_TIMEOUT_MS;
delete process.env.PAYESH_ENV;
delete process.env.NODE_ENV;
delete process.env.REDIS_URL;
delete process.env.PAYESH_BEHIND_PROXY;

if(MODE === 'drain'){
  process.env.PAYESH_TEST_SLOW_MS = '1500';
  process.env.PAYESH_SHUTDOWN_TIMEOUT_MS = '8000';
}
if(MODE === 'prod-noredis'){
  process.env.PAYESH_ENV = 'production';
  process.env.NODE_ENV = 'production';
  /* TLS fail-fast را دور بزنیم تا دقیقاً به درگاهِ ردیس (P0-13) برسیم */
  process.env.PAYESH_BEHIND_PROXY = '1';
  /* P0#2: fail-fastِ کلیدِ نشستِ مشترک را دور بزنیم تا این سناریو دقیقاً
     درگاهِ ردیس (P0-13) را بسنجد — بقیهٔ پیکربندی production اعتبار دارد */
  process.env.PAYESH_JWT_SECRET = 'wave15-child-prod-noredis-jwt-secret-0123456789';
  /* پورتِ ۱ = ECONNREFUSEDِ قطعی و فوری */
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  require(path.join(ROOT, 'server', 'index.js'));
  /* cache.init باید پیش از این تایمر fail-fast کند (exit 1). اگر زنده
     بمانیم یعنی fail-fast شکسته — با کدِ ۳ شکستِ آزمون. */
  setTimeout(() => {
    console.log('UNEXPECTED: production boot without redis did not fail-fast');
    process.exit(3);
  }, 15000);
  return;
}

process.on('uncaughtException', (e) => {
  console.log('UNCAUGHT:' + String((e && e.message) || e));
  process.exit(4);
});

const { server } = require(path.join(ROOT, 'server', 'index.js'));
server.listen(0, () => {
  console.log('READY:' + server.address().port);
});
/* از این‌جا فقط به سیگنال می‌نشینیم — handlerِ Wave 15ِ خودِ ماژول
   (server/index.js) drain و خروج را انجام می‌دهد. */
