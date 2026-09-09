#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   P0-15 — حالت OTP و حدّ‌نرخ‌ها در ردیس (چندنمونه‌ای)
   ۱) ذخیره‌سازی: فلاشِ حالت روی کلیدِ ردیس می‌نشیند
   ۲) دو نمونه: نمونهٔ ب کدِ صادرشدهٔ نمونهٔ الف را می‌بیند
   ۳) پنجاه نوشتِ موازی روی پنجاه تلفن → هیچ‌کدام گم نمی‌شود
   ۴) پنجرهٔ لغزانِ مشترک: اجتماعِ رویدادها حفظ می‌شود
   ۵) محافظ دنباله: نویسندهٔ کهنه حالتِ جدیدتر را نمی‌کُشد
   ۶) کارایی: ۱۰۰۰ عملیات همزمانِ دوجانبه در سقف زمانی
   ۷) بدون ردیس (توسعه): فال‌بک فایل دست‌نخورده کار می‌کند
   اجرا:  node tests/otp-redis.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { createOtpStore } = require(path.join(ROOT, 'server', 'otp-store.js'));
const cache = require(path.join(ROOT, 'server', 'cache.js'));

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* درایور ردیسِ شبیه‌سازی‌شده: یک نگاشتِ مشترک میانِ دو «نمونهٔ سرویس».
   فقط همان سطحِ قراردادی که فروشگاهِ حالت استفاده می‌کند. */
function makeFakeRedis() {
  const map = new Map();
  return {
    _map: map,
    isRedis: () => true,
    get: async (k) => (map.has(k) ? map.get(k) : null),
    set: async (k, v) => { map.set(k, String(v)); return 'OK'; },
    del: async (k) => map.delete(k) ? 1 : 0,
    close: async () => {}
  };
}

const TTL = 5 * 60 * 1000;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'p015-'));

async function main() {
  console.log('▸ P0-15 — حالت OTP در ردیس');
  await cache.init(); /* قفل توزیع‌شده روی درایور حافظهٔ واقعی، درون‌فرایندی */

  const red = makeFakeRedis();
  const A = createOtpStore({ file: path.join(scratch, 'a.json'), ttlMs: TTL, redis: red, cache });
  const B = createOtpStore({ file: path.join(scratch, 'b.json'), ttlMs: TTL, redis: red, cache });

  // ۱) ذخیره‌سازی روی کلیدِ ردیس
  {
    const now = Date.now();
    A.data.codes['09120000001'] = { h: 'h1', at: now, user_id: 7, tries: 0 };
    await A.save();
    const raw = await red.get('payesh:otp:state');
    let doc = null; try { doc = JSON.parse(raw); } catch (e) {}
    chk('فلاش روی کلید ردیس می‌نشیند', !!(doc && doc.codes && doc.codes['09120000001']));
    chk('سند شمارهٔ دنباله دارد', !!(doc && typeof doc.seq === 'number' && doc.seq >= 1));
  }

  // ۲) دو نمونه — ب کدِ الف را می‌بیند
  {
    await B.reloadIfChanged();
    chk('نمونهٔ ب کدِ صادرشدهٔ الف را می‌بیند', !!B.data.codes['09120000001']);
    chk('نمونهٔ ب هیچ فایلی نساخته است', !fs.existsSync(path.join(scratch, 'b.json')));
  }

  // ۳) پنجاه نوشتِ موازی روی پنجاه تلفنِ متمایز
  {
    const jobs = [];
    for (let i = 0; i < 50; i++) {
      const st = i % 2 ? A : B;
      const phone = '0912' + String(1000000 + i);
      jobs.push((async () => {
        await st.reloadIfChanged();
        st.data.codes[phone] = { h: 'h' + i, at: Date.now(), user_id: i, tries: 0 };
        await st.save();
      })());
    }
    await Promise.all(jobs);
    const doc = JSON.parse(await red.get('payesh:otp:state'));
    let present = 0;
    for (let i = 0; i < 50; i++) if (doc.codes['0912' + String(1000000 + i)]) present++;
    chk('۵۰ نوشتِ موازی → ۵۰ رکورد زنده', present === 50, `موجود=${present}`);
  }

  // ۴) پنجرهٔ لغزانِ مشترک — اجتماعِ رویدادها
  {
    await A.reloadIfChanged(); await B.reloadIfChanged();
    const phone = '09129999999';
    const base = Date.now();
    A.data.rate[phone] = [base - 3000, base - 2000];
    B.data.rate[phone] = [base - 1000];
    await Promise.all([A.save(), B.save()]);
    const doc = JSON.parse(await red.get('payesh:otp:state'));
    const win = doc.rate[phone] || [];
    chk('اجتماعِ پنجرهٔ لغزان حفظ می‌شود', win.length === 3, `len=${win.length}`);
  }

  // ۵) محافظ دنباله — نویسندهٔ کهنه نمی‌کُشد
  {
    /* ب بدون فلاش، حالتِ محلیِ تازه می‌گیرد؛ الف دو بار فلاش می‌کند تا
       دنباله جلو بزند؛ سپس فلاشِ ب نباید رکوردِ دومِ الف را بپوشاند. */
    await A.reloadIfChanged(); await B.reloadIfChanged();
    A.data.codes['09130000001'] = { h: 'seq1', at: Date.now(), user_id: 1, tries: 0 };
    await A.save();
    A.data.codes['09130000002'] = { h: 'seq2', at: Date.now(), user_id: 2, tries: 0 };
    await A.save();
    B.data.codes['09130000003'] = { h: 'b-side', at: Date.now(), user_id: 3, tries: 0 };
    await B.save();
    const doc = JSON.parse(await red.get('payesh:otp:state'));
    chk('نوشتِ الف (یکم) زنده می‌ماند', !!doc.codes['09130000001']);
    chk('نوشتِ الف (دوم، جدیدتر از بارگذاری ب) زنده می‌ماند', !!doc.codes['09130000002']);
    chk('نوشتِ ب نیز می‌نشیند', !!doc.codes['09130000003']);
  }

  // ۵٫۵) سنگ‌قبر — کدِ مصرف‌شده باید در همهٔ نمونه‌ها بمیرد
  {
    await A.reloadIfChanged(); await B.reloadIfChanged();
    const phone = '09137777777';
    A.data.codes[phone] = { h: 'tt', at: Date.now(), user_id: 5, tries: 0 };
    await A.save();
    await B.reloadIfChanged();
    chk('ب کدِ صادرشده را می‌بیند', !!B.data.codes[phone]);
    A.deleteCode(phone); /* مصرف در الف */
    await A.save();
    await B.reloadIfChanged();
    chk('کدِ مصرف‌شده در ب می‌میرد (سنگ‌قبر)', !(phone in B.data.codes));
    A.data.codes[phone] = { h: 'tt2', at: Date.now() + 5, user_id: 5, tries: 0 };
    await A.save();
    await B.reloadIfChanged();
    chk('کدِ تازه از سنگ‌قبرِ کهنه رد می‌شود', !!B.data.codes[phone]);
  }

  // ۶) کارایی — ۱۰۰۰ عملیات همزمانِ دوجانبه
  {
    const t0 = Date.now();
    const jobs = [];
    for (let i = 0; i < 1000; i++) {
      const st = i % 2 ? A : B;
      jobs.push((async () => {
        await st.reloadIfChanged();
        const phone = '0935' + String(i).padStart(7, '0');
        st.data.rate_ip['10.0.0.1'] = st.data.rate_ip['10.0.0.1'] || [];
        st.data.rate_ip['10.0.0.1'].push(Date.now());
        st.data.codes[phone] = { h: 'p' + i, at: Date.now(), user_id: i, tries: 0 };
        await st.save();
      })());
    }
    await Promise.all(jobs);
    const dt = Date.now() - t0;
    chk(`۱۰۰۰ عملیات همزمان در سقف زمانی (${dt} میلی‌ثانیه)`, dt < 5000, `${dt}ms`);
    await A.reloadIfChanged();
    await B.reloadIfChanged();
    chk('پس از بار همزمان، هر دو طرف همگام‌اند', A.getSeq() === B.getSeq(),
      `A=${A.getSeq()} B=${B.getSeq()}`);
  }

  // ۷) فال‌بک فایل در توسعهٔ بدون ردیس (رفتار پیشین)
  {
    const fileOnly = createOtpStore({ file: path.join(scratch, 'solo.json'), ttlMs: TTL });
    fileOnly.data.codes['09121111111'] = { h: 'f', at: Date.now(), user_id: 9, tries: 0 };
    await fileOnly.save();
    const written = fs.existsSync(path.join(scratch, 'solo.json'));
    chk('بدون ردیس → فال‌بک فایل کار می‌کند', written);
    const reader = createOtpStore({ file: path.join(scratch, 'solo.json'), ttlMs: TTL });
    await reader.reloadIfChanged();
    chk('خواندنِ مجددِ فایل دست‌نخورده است', !!reader.data.codes['09121111111']);
  }

  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) {}
  console.log(`\notp-redis (P0-15): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
