/* ─────────────────────────────────────────────────────────────
   wave11-cache.js — Cache: L1/L2 Bootstrap، ابطال، ریت‌لیمیت، قفل،
   idempotency و Pub/Sub (server/cache.js + server/redis.js + rate-limit.js)
   -------------------------------------------------------------------
   سوئیتِ یکپارچگیِ موج ۱۱ (نشست ۳، چت ۵): رفتارهایِ میان-ماژولیِ لایهٔ کش
   رویِ همان API واقعی (در سندباکس: فال‌بکِ حافظه؛ با ردیسِ واقعی هم سبز).
   باگ‌هایِ عمیق‌تر در سوئیت‌هایِ اختصاصی‌اند (cache-l2-epoch، redis-mem-ttl).

   C1  رفت‌وبرگشتِ بوت‌استرپ (L1+L2)
   C2  ابطالِ کاربر هر دو لایه را پاک می‌کند
   C3  ابطالِ مدرسه مدرسهٔ دیگر را دست نمی‌زند
   C4  کلیدهایِ epoch در ممیزیِ ردیس ثبت‌اند
   C5  ریت‌لیمیتِ اتمیک: سقف بعد انسداد (پنجرهٔ ثابت)
   C6  قفلِ توزیع‌شده: تصاحب/انحصار/آزادسازی
   C7  idempotency: علامت‌گذاری و بازخوانی
   C8  فن‌اوتِ Pub/Sub به هر دو مشترک می‌رسد
   C9  شکلِ آمارِ L1
   C10 ابطالِ سراسری L1 همه را پاک می‌کند
   ───────────────────────────────────────────────────────────── */
'use strict';
const cache = require('../server/cache.js');
const redis = require('../server/redis.js');
const rateLimit = require('../server/rate-limit.js');
const { classifyKey } = require('../tools/redis-audit.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const P = (uid, schoolId, tag) => ({ user: { id: uid }, school: { id: schoolId }, tag });

(async () => {
  console.log('\n▸ Wave 11 — Cache یکپارچه (driver=' + (redis.isRedis() ? 'redis' : 'memory') + ')');

  /* ── C1: رفت‌وبرگشت ── */
  await cache.setBootstrapCache(101, P(101, 1, 'c1'), 300);
  const c1 = await cache.getBootstrapCache(101);
  chk('C1 نوشتن و خواندنِ بوت‌استرپ', !!c1 && c1.tag === 'c1');

  /* ── C2: ابطالِ کاربر ── */
  await cache.setBootstrapCache(102, P(102, 1, 'c2'), 300);
  await cache.invalidateUser(102);
  chk('C2 پس از ابطالِ کاربر تهی است', (await cache.getBootstrapCache(102)) === null);

  /* ── C3: جداییِ مدرسه‌ها ── */
  await cache.setBootstrapCache(103, P(103, 3, 'c3a'), 300);
  await cache.setBootstrapCache(104, P(104, 4, 'c3b'), 300);
  await cache.invalidateSchool(3);
  chk('C3a مدرسهٔ باطل‌شده تهی شد', (await cache.getBootstrapCache(103)) === null);
  const c3b = await cache.getBootstrapCache(104);
  chk('C3b مدرسهٔ دیگر سالم ماند', !!c3b && c3b.tag === 'c3b');

  /* ── C4: ثبتِ epoch در ممیزی ── */
  const spec = classifyKey('payesh:cache:epoch:school:9');
  chk('C4a کلیدِ epoch شناخته می‌شود', !!spec && spec.owner.indexOf('cache.js') >= 0);
  chk('C4b انتظارِ TTL دارد', !!spec && spec.expectTtl === true);

  /* ── C5: ریت‌لیمیتِ اتمیک ── */
  const rlId = 'w11c5-' + Date.now();
  let allowed = 0, blocked = 0;
  for (let i = 0; i < 4; i++) {
    const r = await rateLimit.checkRateLimit({ prefix: 'w11:test', identifier: rlId, limit: 3, windowSeconds: 60 });
    if (r.allowed) allowed++; else blocked++;
  }
  chk('C5 سه‌تایِ اول مجاز، چهارمی مسدود', allowed === 3 && blocked === 1, allowed + '/' + blocked);
  await redis.del('rate:w11:test:' + rlId);

  /* ── C6: قفل ── */
  const lk = 'w11-lock-' + Date.now();
  const t1 = await cache.acquireLock(lk, 5);
  const t2 = await cache.acquireLock(lk, 5);
  chk('C6a دومی در انحصارِ اولی شکست خورد', typeof t1 === 'string' && t2 === null);
  chk('C6b آزادسازیِ مالک موفق', (await cache.releaseLock(lk, t1)) === true);
  const t3 = await cache.acquireLock(lk, 5);
  chk('C6c پس از آزادسازی دوباره تصاحب شد', typeof t3 === 'string');
  await cache.releaseLock(lk, t3);

  /* ── C7: idempotency ── */
  const uid = 'w11-uid-' + Date.now();
  chk('C7a پیش از علامت، پردازش‌نشده', (await cache.isProcessedUid(uid)) === false);
  await cache.markProcessedUid(uid, 60);
  chk('C7b پس از علامت، پردازش‌شده', (await cache.isProcessedUid(uid)) === true);
  await redis.del('payesh:idempotency:' + uid);

  /* ── C8: فن‌اوتِ Pub/Sub ── */
  const got = [];
  await redis.subscribe('w11:chan', (m) => got.push('a:' + m));
  await redis.subscribe('w11:chan', (m) => got.push('b:' + m));
  await redis.publish('w11:chan', 'hello');
  chk('C8 هر دو مشترک پیام گرفتند', got.length === 2 && got[0] === 'a:hello' && got[1] === 'b:hello',
    JSON.stringify(got));

  /* ── C9: شکلِ آمارِ L1 ── */
  const st = cache.l1Stats();
  chk('C9 آمارِ L1 شکلِ درست دارد',
    st && Number.isFinite(st.size) && Number.isFinite(st.max) && Number.isFinite(st.hits) && Number.isFinite(st.misses),
    JSON.stringify(st));

  /* ── C10: ابطالِ سراسری ── */
  await cache.setBootstrapCache(105, P(105, 5, 'c10a'), 300);
  await cache.setBootstrapCache(106, P(106, 6, 'c10b'), 300);
  await cache.invalidateCollection('subjects');
  chk('C10 ابطالِ سراسری هر دو را پاک کرد',
    (await cache.getBootstrapCache(105)) === null && (await cache.getBootstrapCache(106)) === null);

  /* پاک‌سازی */
  for (const u of [101, 102, 103, 104, 105, 106]) await redis.del('payesh:cache:bootstrap:' + u);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
