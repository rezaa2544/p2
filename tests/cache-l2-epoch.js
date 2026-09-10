#!/usr/bin/env node
/* رگرسیون W11-2 (باگ‌هانت چت ۵، نشست ۳، موج ۱۱): ابطالِ L2 با epoch.
   ─────────────────────────────────────────────────────────────
   ابطالِ مدرسه/سراسری فقط کلیدهایِ L2 کاربرانی را پاک می‌کرد که در L1
   همان نمونه بودند؛ ورودیِ خالص-L2 (پس از LRU، یا پس از ری‌استارت که L1
   خالی است) تا پایانِ TTL (۵ دقیقه) کهنه می‌ماند — از جمله بوت‌استرپِ
   کاربرِ تازه‌تنزل‌یافته. پروبِ زنده: پس از invalidateSchool، خوانشِ L2
   همان payload کهنه را برگرداند.
   رفع: epochِ ابطال (مدرسه + سراسری) در ردیس؛ set جفتِ جاری را در پاکتِ
   L2 می‌دوزد و خوانشِ L2-hit اعتبارسنجی می‌کند. L1-hit بی‌تغییر (pubsub
   پوششش می‌دهد)؛ پاکتِ legacy (پیش از استقرار) پذیرفته می‌شود.
   اجرا: node tests/cache-l2-epoch.js (ردیسِ جعلیِ درون‌فرآیندی) */
'use strict';
const cache = require('../server/cache.js');
const redis = require('../server/redis.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/* ردیسِ جعلی: KV حافظه‌ای با همان امضاها */
function installFake() {
  const kv = new Map();
  const orig = { get: redis.get, set: redis.set, del: redis.del, publish: redis.publish };
  redis.get = async (k) => (kv.has(k) ? kv.get(k) : null);
  redis.set = async (k, v) => { kv.set(k, v); return 'OK'; };
  redis.del = async (...ks) => { let n = 0; for (const k of ks.flat()) if (kv.delete(k)) n++; return n; };
  redis.publish = async () => 1;
  return { kv, restore() { Object.assign(redis, orig); } };
}
const payload = (uid, schoolId, role) => ({ user: { id: uid }, school: schoolId == null ? null : { id: schoolId }, role });

(async () => {
  console.log('\n▸ W11-2 — ابطالِ مدرسه/سراسری L2 را هم می‌پوشاند');
  const fake = installFake();
  const prevMax = cache.l1Stats().max;
  try {
    /* ── ۱) سناریویِ اصلی: خالص-L2 + ابطالِ مدرسه ── */
    await cache.setBootstrapCache(7, payload(7, 1, 'manager'), 300);
    cache.setL1MaxEntries(1); /* فشارِ LRU: u7 از L1 بیرون، L2 نگهش می‌دارد */
    await cache.setBootstrapCache(8, payload(8, 2, 'teacher'), 300);
    await cache.invalidateSchool(1);
    const stale = await cache.getBootstrapCache(7);
    chk('E1 پس از ابطالِ مدرسه، خوانشِ خالص-L2 تهی است (نه کهنه)', stale === null,
      stale === null ? '' : 'role=' + stale.role);
    cache.setL1MaxEntries(prevMax);

    /* ── ۲) پینِ رفتارِ موجود: ساکنِ L1 همان مدرسه ابطال می‌شود ── */
    await cache.setBootstrapCache(9, payload(9, 1, 'teacher'), 300);
    await cache.invalidateSchool(1);
    chk('E2 ورودیِ L1 همان مدرسه ابطال شد', (await cache.getBootstrapCache(9)) === null);

    /* ── ۳) بدونِ ابطالِ بیش‌ازحد: مدرسهٔ دیگر سالم می‌ماند ── */
    await cache.setBootstrapCache(10, payload(10, 2, 'teacher'), 300);
    cache.setL1MaxEntries(1);
    await cache.setBootstrapCache(11, payload(11, 3, 'teacher'), 300);
    await cache.invalidateSchool(1);
    const other = await cache.getBootstrapCache(10);
    chk('E3 مدرسهٔ دیگر از L2 سالم خوانده شد', !!other && other.role === 'teacher');
    cache.setL1MaxEntries(prevMax);

    /* ── ۴) ابطالِ سراسری (بی‌schoolId) خالص-L2 را می‌پوشاند ── */
    await cache.setBootstrapCache(12, payload(12, 5, 'manager'), 300);
    cache.setL1MaxEntries(1);
    await cache.setBootstrapCache(13, payload(13, 6, 'teacher'), 300);
    await cache.invalidateCollection('subjects'); /* بی‌schoolId → سراسری */
    chk('E4 پس از ابطالِ سراسری، خوانشِ خالص-L2 تهی است', (await cache.getBootstrapCache(12)) === null);
    cache.setL1MaxEntries(prevMax);

    /* ── ۵) سازگاریِ استقرار: پاکتِ legacy پذیرفته می‌شود ── */
    fake.kv.set('payesh:cache:bootstrap:14', JSON.stringify(payload(14, 1, 'legacy')));
    const leg = await cache.getBootstrapCache(14);
    chk('E5 مقدارِ legacy (بی‌پاکت) خوانده شد', !!leg && leg.role === 'legacy');

    /* ── ۶) ابطالِ پیاپیِ سریع هنوز معتبر است (epoch یکتا) ── */
    await cache.setBootstrapCache(15, payload(15, 7, 'manager'), 300);
    cache.setL1MaxEntries(1);
    await cache.setBootstrapCache(16, payload(16, 8, 'teacher'), 300);
    await cache.invalidateSchool(7);
    await cache.invalidateSchool(7);
    chk('E6 ابطالِ دوتاییِ هم‌میلی‌ثانیه معتبر ماند', (await cache.getBootstrapCache(15)) === null);
    cache.setL1MaxEntries(prevMax);

    /* ── ۷) دقیق‌بودنِ ابطالِ کاربر + بی‌اثریِ ابطالِ مدرسه بر سراسری ── */
    await cache.setBootstrapCache(17, payload(17, 9, 'manager'), 300);
    cache.setL1MaxEntries(1);
    await cache.setBootstrapCache(18, payload(18, 10, 'teacher'), 300);
    await cache.invalidateUser(17);
    chk('E7 ابطالِ مستقیمِ کاربر L2 را پاک کرد', (await cache.getBootstrapCache(17)) === null);
    await cache.setBootstrapCache(19, payload(19, null, 'superadmin'), 300);
    cache.setL1MaxEntries(1);
    await cache.setBootstrapCache(20, payload(20, 11, 'teacher'), 300);
    await cache.invalidateSchool(11);
    const sa = await cache.getBootstrapCache(19);
    chk('E8 ابطالِ مدرسه به بوت‌استرپِ سراسری دست نزد', !!sa && sa.role === 'superadmin');
    cache.setL1MaxEntries(prevMax);
  } finally {
    cache.setL1MaxEntries(prevMax);
    fake.restore();
  }

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
