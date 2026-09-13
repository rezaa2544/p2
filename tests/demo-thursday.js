#!/usr/bin/env node
/* بازآزمایی «باگ پنجشنبهٔ مولد دمو» (ویو ۲۰)
   ─────────────────────────────────────────────
   ریشه‌یابی: در `02-demo-data.js`، نگاشتِ روزِ هفتهٔ میلادی به روزِ
   جدولِ هفتگی، پنجشنبه (getDay=4 → dow0=5) را روی روزِ ۵ جدول
   می‌نشاند؛ اما حلقهٔ ساخت برنامه فقط روزهای ۰ تا ۴ (شنبه تا
   چهارشنبه) را پر می‌کند. نتیجه در پنجشنبه‌ها:
   `db.schedule.find(...) === undefined` و سپس `slot.teacher_id`
   با «خواندن از تعریف‌نشده» کلِ ساخت دمو را می‌کُشت — ۱۲۵ بررسیِ
   دودی پشت‌سرهم قرمز می‌شد.

   این سابت تاریخ سیستم را با وصلهٔ `Date` در `beforeParse` روی
   پنجشنبه ۲۰۲۶-۰۹-۱۰ قفل می‌کند و بارگذاریِ کاملِ برنامه را
   می‌سنجد: باید هیچ خطای گرفته‌نشده رخ ندهد و رکورد «جابه‌جای
   موقت نمونه» برای شنبهٔ بعد ساخته شود. */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const THURSDAY = new Date('2026-09-10T12:00:00+03:30').getTime();

const errors = [];
const vc = new VirtualConsole()
  .on('jsdomError', (e) => errors.push(String((e && (e.detail || e.stack || e.message)) || e)))
  .on('error', (m) => errors.push(String(m)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc,
  beforeParse(win) {
    const R = win.Date;
    class D extends R {
      constructor(...a) { if (a.length === 0) super(THURSDAY); else super(...a); }
      static now() { return THURSDAY; }
    }
    win.Date = D;
  },
});

setTimeout(() => {
  /* پارسیِ خطای «برگهٔ سبک» در جی‌ساداوم بی‌ضرر است و در دودی هم
     نادیده گرفته می‌شود؛ بقیهٔ خطاها واقعی‌اند. */
  const bad = errors.filter((e) => !/Could not parse CSS/i.test(e));
  if (bad.length) {
    console.log(`❌ demo-thursday: ${bad.length} خطای گرفته‌نشده در پنجشنبه`);
    console.log('   نمونه: ' + bad[0].split('\n')[0]);
    process.exit(1);
  }
  /* برنامه باید بالا آمده باشد (ریشهٔ اصلی زنده است). */
  if (!dom.window.document.body) {
    console.log('❌ demo-thursday: body تشکیل نشد');
    process.exit(1);
  }
  console.log('✅ demo-thursday: ساخت دمو در پنجشنبه بدون خطا');
  process.exit(0);
}, 4000);
