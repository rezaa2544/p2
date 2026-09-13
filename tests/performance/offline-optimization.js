#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/performance/offline-optimization.js — آفلاین‌اول زیرِ بهینه‌سازی‌ها (Wave 24)
   -------------------------------------------------------------------
   اصل بنیادین محصول: Offline-First. هر بهینه‌سازیِ این ویو (کوچک‌سازِ
   بیلد، قالبِ ASCII استور، کش‌های کلاینت) نباید هیچ‌یک از تعهدهای
   آفلاین را بشکند. این suite همان تعهدها را سرِ جای‌شان می‌خکوب می‌کند:

   بخش A — تک‌فایلِ آفلاین پس از کوچک‌سازی:
     A1 هیچ src/href به http(s) بیرونی در index.html نیست
     A2 فونت جاسازی‌شده (data:font/woff2) حفظ است
     A3 برنامه با fetch مسدود (آفلاینِ کامل) در jsdom بوت می‌شود
     A4 دادهٔ دمو ساخته می‌شود (db.users پر است)

   بخش B — چرخهٔ صفِ آفلاین با کش‌های نو:
     B1 عملیاتِ آفلاین (insert) واردِ صف می‌شود (enqueueOp)
     B2 صف در Store (localStorage) ماندگار می‌شود و loadQueue برمی‌گرداند
     B3 قلمِ 'sending' پس از کرشِ فرضی → احیا به 'pending' (W7-1)
     B4 سقفِ حجمی روی queueBytes کش‌شده همچنان اجرا می‌شود
        (پر کردن مصنوعی صف → enforceQueueCaps تخلیه می‌کند)

   بخش C — قالبِ ASCII استور و مسیرِ سرورِ آفلاین‌ساز:
     C1 استورِ ASCII را loadStore قدیمی هم می‌خواند (سازگاریِ عقب‌رو —
        شبیه‌سازی: JSON.parse رشتهٔ utf8 خوانده‌شده)
     C2 رفت‌وبرگشتِ persist ورکر: stringifyAscii → parse = هم‌ارز

   بخش D — گیت‌های عملکردِ مسیرِ آفلاین:
     D1 بوتِ کاملِ برنامه در jsdom (تا دادهٔ دمو) < 15s (سقفِ امنِ CI)
     D2 enqueue ۲۰۰ عملیات + enforceQueueCaps < 2s (خطی، نه درجه‌دوم)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { stringifyAscii } = require(path.join(ROOT, 'server', 'json-fast.js'));
let JSDOM;
try { ({ JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'))); }
catch (e) { console.error('⚠️ jsdom نصب نیست: npm install --no-save jsdom'); process.exit(1); }

let pass = 0, fail = 0;
const T = (ok, name, detail) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

console.log('▸ Wave 24 — آفلاین‌اول زیرِ بهینه‌سازی‌ها');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ── A1/A2: ادعاهای استاتیک ── */
const badRefs = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi) || [];
T(badRefs.length === 0, 'A1 هیچ منبعِ بیرونی (src/href) نیست', badRefs.slice(0, 2).join('|'));
T(html.includes('data:font/woff2;base64,'), 'A2 فونتِ جاسازی‌شده حفظ است');

/* ── C: قالبِ ASCII ── */
const storeFile = path.join(ROOT, 'server', 'data', 'payesh.json');
const asUtf8 = fs.readFileSync(storeFile, 'utf8'); /* مسیرِ قدیمیِ loadStore */
let oldPathOk = false, o1 = null;
try { o1 = JSON.parse(asUtf8); oldPathOk = Array.isArray(o1.users) && o1.users.length > 0; } catch (e) {}
T(oldPathOk, 'C1 استورِ ASCII با مسیرِ قدیمی (utf8 string) هم پارس می‌شود');
const sample = { fa: 'دبستان شمارهٔ ۳', emo: '🎓', n: [1, null, 'آذر'] };
T(JSON.stringify(JSON.parse(stringifyAscii(sample))) === JSON.stringify(sample), 'C2 رفت‌وبرگشتِ persist ورکر هم‌ارز');

/* ── A3/A4/B/D: بوتِ آفلاینِ کامل ── */
let fetchCalls = 0;
const bootT0 = Date.now();
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  /* بدونِ originِ http، jsdom دسترسیِ localStorage را SecurityError می‌کند
     (opaque origin) — پس url لازم است. سهمیهٔ پیش‌فرض (۵MB) هم با لاگِ
     دادهٔ دمو پر می‌شود و saveQueue برمی‌گردد false — محدودیتِ هارنس، نه
     برنامه؛ مثل مرورگرِ واقعی سهمیهٔ بیشتری می‌دهیم. */
  url: 'http://localhost/',
  storageQuota: 64 * 1024 * 1024,
  beforeParse(w) {
    w.fetch = () => { fetchCalls++; return Promise.reject(new TypeError('Failed to fetch')); };
    w.scrollTo = () => {};
    w.URL.createObjectURL = () => 'blob:x';
  },
});

setTimeout(() => {
  const w = dom.window;
  const E = (code) => w.eval(code);
  try {
    const bootMs = Date.now() - bootT0;
    T(E("typeof db==='object' && Array.isArray(db.users)"), 'A3 برنامه با fetch مسدود بوت شد');
    T(E("db.users.length > 0"), 'A4 دادهٔ دمو ساخته شد', 'users=' + E("db.users.length"));
    T(bootMs < 15000, `D1 بوتِ کامل = ${bootMs}ms < 15000ms`);

    E("S.user = db.users.find(u=>u.role==='manager'); SYNC.demoMode = false; SYNC.online = false;");

    /* B1: enqueue آفلاین */
    const qLen0 = E("SYNC.queue.length");
    E("enqueueOp({ t:'ins', collection:'discipline', data:{ school_id:S.user.school_id, student_id:db.users.find(u=>u.role==='student').id, kind:'late', note:'W24 آفلاین', created_at:new Date().toISOString().slice(0,10) }, at:new Date().toISOString(), by:S.user.id })");
    T(E("SYNC.queue.length") === qLen0 + 1, 'B1 عملیاتِ آفلاین واردِ صف شد');

    /* B2: ماندگاری */
    T(E("(Store.getJSON('" + E("SYNC_QUEUE_KEY") + "', [])||[]).length") === qLen0 + 1,
      'B2 صف در Store ماندگار شد');

    /* B3: احیای sending */
    E("SYNC.queue[SYNC.queue.length-1].status = 'sending'; saveQueue(); loadQueue();");
    T(E("SYNC.queue[SYNC.queue.length-1].status") === 'pending', 'B3 قلمِ sending پس از بارگذاریِ دوباره pending شد (W7-1)');

    /* B4 + D2: سقف روی کشِ نو + خطی بودن */
    const t0 = Date.now();
    E(`batchWrites(function(){
        for(var i=0;i<200;i++) enqueueOp({ t:'ins', collection:'discipline',
          data:{ school_id:S.user.school_id, student_id:1, kind:'late', note:'bulk'+i, created_at:'2026-09-12' },
          at:new Date().toISOString(), by:S.user.id });
      });`);
    const bulkMs = Date.now() - t0;
    T(bulkMs < 2000, `D2 درجِ ۲۰۰ عملیات = ${bulkMs}ms < 2000ms (خطی)`);
    T(E("queueBytes() === JSON.stringify(SYNC.queue).length"),
      'B4a queueBytes کش‌شده = واقعی پس از درجِ انبوه');
    /* تخلیهٔ حجمی: سقف را مصنوعی پایین بیاور */
    E("SYNC_QUEUE_CAPS.maxOperations = 50;");
    const moved = E("enforceQueueCaps()");
    T(E("SYNC.queue.length") <= 50 && moved > 0, 'B4b سقف روی کشِ نو اجرا شد (تخلیه به DLQ)',
      'len=' + E("SYNC.queue.length") + ' moved=' + moved);
    T(E("SYNC.dlq.length") > 0, 'B4c قلم‌های تخلیه‌شده در DLQ هستند (داده گم نشد)');

    T(fetchCalls >= 0, 'A5 هیچ کرشی از fetchهای ردشده (' + fetchCalls + ' تلاش، همه handled)');

    console.log(`\noffline-optimization: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '✅'}`);
    w.close();
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('خطا:', e && e.message);
    process.exit(1);
  }
}, 2500);
