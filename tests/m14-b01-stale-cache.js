#!/usr/bin/env node
/* رگرسیون M14-B01 — stale cache پس از قطعی/بازیابیِ ردیس.
   ─────────────────────────────────────────────────────────────
   invalidateUser / invalidateSchool / invalidateCollection در قطعیِ
   ردیس می‌پرند: del نمی‌رسد، publish نمی‌رسد، epoch بسته نمی‌شود. ورودیِ
   L2 زنده می‌ماند و پس از بازیابی، epochِ فعلی همان جفتِ قدیمی را
   تأیید می‌کند ⇒ مقدارِ قدیمی دوباره سرو می‌شود. بازتولیدِ زنده
   (kill/restart ردیسِ واقعی با AOF): کلید از قطعی جان سالم به در می‌برد،
   publish هرگز نمی‌رسد، و خوانشِ پس از بازیابی full_name='OLD' را
   برمی‌گرداند.
   رفع (server/cache.js): ابطالِ ناموفق در همان فرایند ثبت می‌شود،
   خوانشِ کاربر/مدرسهٔ معوق اجباراً miss می‌خورد (حتی حینِ قطعیِ کامل)،
   و پس از بازیابی replay می‌شود.
   اجرا:
     node tests/m14-b01-stale-cache.js                      # NORMAL: رفتارِ اصلاح‌شده — باید EXIT=0
     B01_MUTATE=VULN node tests/m14-b01-stale-cache.js      # negative proof: رفتارِ پیشین — باید EXIT=0
   هر دو باید EXIT=0 بدهند: NORMAL یعنی stale سرو نمی‌شود، VULN یعنی
   دقیقاً همان stale بازتولید می‌شود (اگر VULN EXIT≠0 شد، یعنی این
   آزمون بارِ اثباتی ندارد). */
'use strict';
const cache = require('../server/cache.js');
const redis = require('../server/redis.js');

const VULN = process.env.B01_MUTATE === 'VULN';
let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/* ردیسِ جعلی: KV حافظه‌ای. broken = قطعی: تمامِ عملیاتِ نوشتاری
   REDIS_UNAVAILABLE می‌پرند، اما get همچنان کار می‌کند — همان چیزی که
   در بازتولیدِ واقعیِ kill/restart با AOF دیدیم: کلیدِ L2 از قطعی جان
   سالم به در می‌برد، در حالی که ابطال drop شده است. */
function installFake() {
  const kv = new Map();
  const sets = new Map();
  const orig = {
    get: redis.get, set: redis.set, del: redis.del, publish: redis.publish,
    sAdd: redis.sAdd, sRem: redis.sRem, sMembers: redis.sMembers,
    expire: redis.expire, isRedis: redis.isRedis
  };
  const fake = { broken: false, publishReached: false, kv };
  const needUp = () => {
    if (!fake.broken) return;
    const e = new Error('REDIS_UNAVAILABLE');
    e.code = 'REDIS_UNAVAILABLE';
    throw e;
  };
  redis.get = async (k) => (kv.has(k) ? kv.get(k) : null);
  redis.set = async (k, v) => { needUp(); kv.set(k, v); return 'OK'; };
  redis.del = async (...ks) => { needUp(); let n = 0; for (const k of ks.flat()) if (kv.delete(k)) n++; return n; };
  redis.publish = async () => { needUp(); fake.publishReached = true; return 1; };
  redis.sMembers = async (k) => { needUp(); return Array.from(sets.get(k) || []); };
  redis.sRem = async (k, ...ms) => { needUp(); const s = sets.get(k); if (!s) return 0; let n = 0; for (const m of ms) if (s.delete(m)) n++; return n; };
  redis.sAdd = async (k, ...ms) => { needUp(); if (!sets.has(k)) sets.set(k, new Set()); ms.forEach((m) => sets.get(k).add(m)); return ms.length; };
  redis.expire = async () => { needUp(); return 1; };
  redis.isRedis = () => !fake.broken;
  return { fake, restore() { Object.assign(redis, orig); } };
}
const payload = (uid, schoolId, role, full_name) => ({
  user: { id: uid }, school: schoolId == null ? null : { id: schoolId }, role, full_name
});
const B = () => cache.__b01PendingForTests();
const L1 = () => cache.__l1ForTests();
const l2key = (uid) => `payesh:cache:bootstrap:${uid}`;

(async () => {
  console.log(VULN ? '\n▸ M14-B01 — [حالتِ VULN: negative proof] stale-cache پس از بازیابیِ ردیس'
                   : '\n▸ M14-B01 — stale cache پس از قطعی/بازیابیِ ردیس (رفع فعال)');
  const inst = installFake();
  const fake = inst.fake;
  const prevMax = cache.l1Stats().max;
  let threw = null;
  try {
    /* ── ۱) user-scope: ابطالِ ناموفق ⇒ stale نباید سرو شود ── */
    await cache.setBootstrapCache(7001, payload(7001, 1, 'manager', 'OLD'), 300);
    fake.broken = true; fake.publishReached = false;
    threw = null;
    try { await cache.invalidateUser(7001); } catch (e) { threw = e; }
    chk('B1a invalidateUser در قطعی REDIS_UNAVAILABLE پرید', !!(threw && threw.code === 'REDIS_UNAVAILABLE'), threw && threw.message);
    chk('B1b publish در قطعی هرگز نرسید', fake.publishReached === false);
    chk('B1c ابطالِ ناموفق معوق ثبت شد', B().users >= 1, 'users=' + B().users);
    chk('B1d کلیدِ L2 از قطعی جان سالم به در برد', !!fake.kv.get(l2key(7001)));

    const whileDown = await cache.getBootstrapCache(7001);
    if (VULN) {
      chk('B1e (VULN) حینِ قطعی، payload کهنه سرو شد', !!whileDown && whileDown.full_name === 'OLD', whileDown && whileDown.full_name);
    } else {
      chk('B1e خوانشِ حینِ قطعیِ کامل تهی است (نه کهنه)', whileDown === null, whileDown && whileDown.full_name);
    }

    fake.broken = false;   /* بازیابیِ ردیس */
    const afterRecover = await cache.getBootstrapCache(7001);
    if (VULN) {
      chk('B1f (VULN) پس از بازیابی، stale سرو شد — رفتارِ پیشین بازتولید شد',
          !!afterRecover && afterRecover.full_name === 'OLD', afterRecover && afterRecover.full_name);
      chk('B1g (VULN) کلیدِ L2 همچنان زنده است (هیچ‌کس پاکش نکرد)', !!fake.kv.get(l2key(7001)));
      chk('B1h (VULN) ابطالِ معوق هرزمان نمی‌خوابد (چیزی replay نمی‌کند)', B().users === 1, 'users=' + B().users);
    } else {
      chk('B1f پس از بازیابی نیز stale سرو نشد', afterRecover === null, afterRecover && afterRecover.full_name);
      chk('B1g کلیدِ L2 توسطِ replay پاک شد', !fake.kv.get(l2key(7001)));
      chk('B1h replay، ابطالِ معوق را تخلیه کرد', B().users === 0, 'users=' + B().users);
    }

    /* پس از rebuild از DB، مقدارِ تازه سرو می‌شود (در هر دو حالت) */
    await cache.setBootstrapCache(7001, payload(7001, 1, 'manager', 'NEW'), 300);
    const fresh = await cache.getBootstrapCache(7001);
    chk('B1i پس از rebuild، مقدارِ تازه سرو می‌شود', !!fresh && fresh.full_name === 'NEW', fresh && fresh.full_name);

    /* ── ۲) school-scope ── */
    B().clear();
    await cache.setBootstrapCache(7002, payload(7002, 1, 'teacher', 'OLD'), 300);
    L1().clear();   /* خوانشِ خالص-L2 */
    fake.broken = true; fake.publishReached = false;
    threw = null;
    try { await cache.invalidateSchool(1); } catch (e) { threw = e; }
    chk('B2a invalidateSchool در قطعی REDIS_UNAVAILABLE پرید', !!(threw && threw.code === 'REDIS_UNAVAILABLE'), threw && threw.message);
    chk('B2b ابطالِ مدرسهٔ معوق ثبت شد', B().schools >= 1, 'schools=' + B().schools);
    L1().clear();

    const s2 = await cache.getBootstrapCache(7002);
    if (VULN) {
      chk('B2c (VULN) حینِ قطعی، school-scope کهنه سرو شد', !!s2 && s2.full_name === 'OLD', s2 && s2.full_name);
    } else {
      chk('B2c خوانشِ حینِ قطعیِ school-scope تهی است', s2 === null, s2 && s2.full_name);
    }
    fake.broken = false;
    const s2b = await cache.getBootstrapCache(7002);
    if (VULN) {
      chk('B2d (VULN) پس از بازیابی، school-scope stale سرو شد', !!s2b && s2b.full_name === 'OLD', s2b && s2b.full_name);
      chk('B2e (VULN) ابطالِ مدرسه هرزمان replay نمی‌شود', B().schools === 1, 'schools=' + B().schools);
    } else {
      chk('B2d پس از بازیابی، school-scope stale سرو نشد', s2b === null, s2b && s2b.full_name);
      chk('B2e ابطالِ مدرسه تخلیه شد', B().schools === 0, 'schools=' + B().schools);
    }

    /* ── ۳) global-scope ── */
    B().clear();
    await cache.setBootstrapCache(7003, payload(7003, 2, 'manager', 'OLD'), 300);
    L1().clear();
    fake.broken = true; fake.publishReached = false;
    threw = null;
    try { await cache.invalidateCollection('subjects'); } catch (e) { threw = e; }
    chk('B3a invalidateCollectionِ سراسری در قطعی REDIS_UNAVAILABLE پرید', !!(threw && threw.code === 'REDIS_UNAVAILABLE'), threw && threw.message);
    chk('B3b ابطالِ سراسری به all ثبت شد', B().all === true, 'all=' + B().all);

    const g3 = await cache.getBootstrapCache(7003);
    if (VULN) {
      chk('B3c (VULN) حینِ قطعی، global-scope کهنه سرو شد', !!g3 && g3.full_name === 'OLD', g3 && g3.full_name);
    } else {
      chk('B3c خوانشِ حینِ قطعیِ سراسری تهی است', g3 === null, g3 && g3.full_name);
    }
    fake.broken = false;
    const g3b = await cache.getBootstrapCache(7003);
    if (VULN) {
      chk('B3d (VULN) پس از بازیابی، global stale سرو شد', !!g3b && g3b.full_name === 'OLD', g3b && g3b.full_name);
      chk('B3e (VULN) all هرزمان تخلیه نمی‌شود', B().all === true, 'all=' + B().all);
    } else {
      chk('B3d پس از بازیابی، global stale سرو نشد', g3b === null, g3b && g3b.full_name);
      chk('B3e پس از replay، all تخلیه شد', B().all === false, 'all=' + B().all);
    }

    /* ── ۴) دقت: کاربرِ دیگر همچنان سرو می‌شود (در هر دو حالت) ── */
    B().clear();
    await cache.setBootstrapCache(7004, payload(7004, 3, 'teacher', 'OK4'), 300);
    await cache.setBootstrapCache(7005, payload(7005, 4, 'teacher', 'OK5'), 300);
    L1().clear();
    fake.broken = true;
    try { await cache.invalidateUser(7004); } catch (e) {}
    chk('B4a فقط کاربرِ معوق ثبت شد (نه all)', B().users === 1 && !B().all, 'users=' + B().users + ' all=' + B().all);
    fake.broken = false;
    const other = await cache.getBootstrapCache(7005);
    chk('B4b کاربرِ دیگر از L2 سالم خوانده شد', !!other && other.full_name === 'OK5', other && other.full_name);

    /* ── ۵) L1 محلی حتی در قطعی پاک می‌شود (در هر دو حالت) ── */
    B().clear();
    await cache.setBootstrapCache(7006, payload(7006, 5, 'teacher', 'X'), 300);
    await cache.setBootstrapCache(7007, payload(7007, 6, 'teacher', 'Y'), 300);
    await cache.setBootstrapCache(7008, payload(7008, 7, 'teacher', 'Z'), 300);
    fake.broken = true;
    try { await cache.invalidateSchool(5); } catch (e) {}
    chk('B5a L1ِ مدرسه در قطعی پاک شد', L1().has(7006) === false);
    try { await cache.invalidateUser(7007); } catch (e) {}
    chk('B5b L1ِ کاربر در قطعی پاک شد', L1().has(7007) === false);
    try { await cache.invalidateCollection('subjects'); } catch (e) {}
    chk('B5c L1ِ سراسری در قطعی پاک شد', L1().has(7008) === false);
    fake.broken = false;

    /* ── ۶) تشدیدِ قطعیِ طولانی: بیش از سقف ⇒ همه miss ── */
    B().clear();
    fake.broken = true;
    for (let i = 8000; i < 8000 + 2002; i++) {
      try { await cache.invalidateUser(i); } catch (e) {}
    }
    chk('B6a قطعیِ طولانی به all تشدید کرد (کران‌دار شدنِ حافظه)', B().all === true, 'all=' + B().all);
    const esc = await cache.getBootstrapCache(99999);   /* کاربرِ ناشناخته */
    chk('B6b در حالتِ تشدید، همهٔ خوانش‌ها miss است', esc === null);
    fake.broken = false;
    await B().replay();
    if (VULN) {
      chk('B6c (VULN) replay غیرفعال است: all باقی ماند', B().all === true, 'all=' + B().all);
    } else {
      chk('B6c پس از بازیابی، تشدید تخلیه شد', B().all === false && B().users === 0, 'all=' + B().all + ' users=' + B().users);
    }
  } finally {
    cache.setL1MaxEntries(prevMax);
    B().clear();
    inst.restore();
  }

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
