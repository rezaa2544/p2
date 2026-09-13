#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave6-11-redis-live.js — گیتِ زندهٔ Redis برای موج ۶ و ۱۱
   ───────────────────────────────────────────────────────────────────
   قیدِ pending مشترکِ docs/WAVE6_REDIS_AUDIT.md («اتصالِ واقعی به یک
   redis-server هنوز pending است») و docs/WAVE11_CACHE_STRATEGY.md
   («ردیسِ زنده در ساندباکس نیست — همه با fake اثبات شده»).

   این سوئیت همان قراردادهایی را که تا امروز فقط با clientِ جعلی سنجیده
   می‌شدند، روی یک redis-server *واقعی* می‌سنجد:

   موج ۶ (Distributed State):
     R1  init با REDIS_URL زنده ⇒ isRedis=true، حالت standalone
     R2  get/set/del/EX — انقضای واقعی (نه شبیه‌سازی تایمر)
     R3  incrWithTtl — شمارندهٔ rate-limit اتمی + پنجرهٔ لغزان واقعی
     R4  setNX — قفل توزیع‌شده: برندهٔ واحد بین ۲۰ رقیبِ هم‌زمان
     R5  compareAndDelete (Lua CAS) — فقط صاحبِ توکن آزاد می‌کند
     R6  sAdd/sMembers/sRem — ایندکسِ مجموعه‌ای
     R7  publish/subscribe — ابطالِ بین‌نمونه‌ای (دو کلاینت جدا)
     R8  denylist ابطالِ نشست (revoked:<jti>) با EX = باقیِ عمرِ توکن

   موج ۱۱ (Cache Hierarchy):
     C1  L2 روی Redis واقعی: set → get → ttl در بازهٔ منطقی
     C2  invalidation: del واقعی کلید L2 را می‌کشد
     C3  ایندکسِ مدرسه (sAdd) + انقضای گروهی
     C4  stampede: N=50 خوانندهٔ هم‌زمانِ کلیدِ سرد ⇒ فقط ۱ تولید
         (withSingleFlight درون‌نمونه + قفلِ NX بین‌نمونه‌ای)
     C5  epochِ ابطال (W11-2): ابطال ⇒ epoch تازه ⇒ L2-hit کهنه رد می‌شود

   بدونِ redis-server در PATH (و بدونِ REDIS_LIVE_URL): self-skip —
   الگوی بخشِ B موج ۳؛ CI بدونِ ردیس قرمز نمی‌شود.

   اجرا:
     PATH=...redis-server-dir:$PATH node tests/wave6-11-redis-live.js
     یا REDIS_LIVE_URL=redis://127.0.0.1:6379 node tests/wave6-11-redis-live.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const cp = require('child_process');
const path = require('path');

let okc = 0, failc = 0, skipped = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}
function skip(name, why) { skipped++; console.log('  ⏭️  ' + name + '  —  ' + why); }
function finish() {
  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc)
    + (skipped ? ' (' + skipped + ' skip)' : ''));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findRedisServer() {
  try {
    const w = cp.execSync('which redis-server', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w) return w;
  } catch (e) {}
  return null;
}

async function startRedis() {
  if (process.env.REDIS_LIVE_URL) return { url: process.env.REDIS_LIVE_URL, proc: null };
  const bin = findRedisServer();
  if (!bin) return null;
  const port = 16419;
  const proc = cp.spawn(bin, ['--port', String(port), '--save', '', '--appendonly', 'no',
    '--daemonize', 'no', '--logfile', '', '--protected-mode', 'no'], { stdio: ['ignore', 'ignore', 'ignore'] });
  const url = 'redis://127.0.0.1:' + port;
  const RedisLib = require('ioredis');
  const probe = new RedisLib(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  probe.on('error', () => {});
  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    try { if ((await probe.ping()) === 'PONG') { ok = true; break; } } catch (e) {}
    await sleep(200);
  }
  try { probe.disconnect(); } catch (e) {}
  if (!ok) { try { proc.kill('SIGKILL'); } catch (e) {} return null; }
  return { proc, url };
}

async function main() {
  console.log('\n▸ Wave 6+11 — قراردادهای Redis روی سرورِ واقعی');
  let RedisLib;
  try { RedisLib = require('ioredis'); } catch (e) { skip('live redis gate', 'ioredis نصب نیست'); return finish(); }
  const ctx = await startRedis();
  if (!ctx) { skip('live redis gate', 'redis-server در PATH نیست و REDIS_LIVE_URL هم نیست'); return finish(); }

  process.env.REDIS_URL = ctx.url;
  delete process.env.NODE_ENV; /* توسعه: init مجاز است ولی ما URL زنده می‌دهیم */

  const redis = require(path.join(__dirname, '..', 'server', 'redis.js'));
  const cache = require(path.join(__dirname, '..', 'server', 'cache.js'));

  try {
    /* ── R1: init واقعی ── */
    const ini = await redis.init();
    chk('R1 init با REDIS_URL زنده ⇒ ok و درایورِ واقعی', !!(ini && ini.ok !== false) && redis.isRedis() === true,
      JSON.stringify({ ini, isRedis: redis.isRedis(), status: redis.getStatus && redis.getStatus() }));

    /* ── R2: get/set/del + EX واقعی ── */
    await redis.set('w611:k1', 'v1');
    const g1 = await redis.get('w611:k1');
    await redis.del('w611:k1');
    const g2 = await redis.get('w611:k1');
    chk('R2a set→get→del→get روی سرورِ واقعی', g1 === 'v1' && g2 == null, 'g1=' + g1 + ' g2=' + g2);

    await redis.set('w611:exp', 'x', 'EX', 1);
    const before = await redis.get('w611:exp');
    await sleep(1300);
    const after = await redis.get('w611:exp');
    chk('R2b انقضای EX واقعی است (۱s)', before === 'x' && after == null, 'before=' + before + ' after=' + after);

    /* ── R3: incrWithTtl — پنجرهٔ rate-limit ── */
    const c1 = await redis.incrWithTtl('w611:rate', 2);
    const c2 = await redis.incrWithTtl('w611:rate', 2);
    const c3 = await redis.incrWithTtl('w611:rate', 2);
    const tl = await redis.ttl('w611:rate');
    chk('R3a شمارندهٔ اتمی: ۱،۲،۳ + TTL ست‌شده', c1 === 1 && c2 === 2 && c3 === 3 && tl > 0 && tl <= 2,
      [c1, c2, c3, 'ttl=' + tl].join(','));
    await sleep(2300);
    const c4 = await redis.incrWithTtl('w611:rate', 2);
    chk('R3b پنجره واقعاً می‌لغزد (پس از انقضا ⇒ ۱)', c4 === 1, 'c4=' + c4);

    /* ── R4: setNX — قفلِ توزیع‌شده، ۲۰ رقیبِ هم‌زمان ── */
    const rivals = await Promise.all(Array.from({ length: 20 }, (_, i) => redis.setNX('w611:lock', 'owner' + i, 10)));
    const winners = rivals.filter((r) => r === true || r === 'OK' || r === 1).length;
    chk('R4 قفل NX: دقیقاً یک برنده از ۲۰ رقیبِ هم‌زمان', winners === 1, 'winners=' + winners + ' raw=' + JSON.stringify(rivals.slice(0, 5)));

    /* ── R5: compareAndDelete — فقط صاحبِ توکن ── */
    const ownerVal = await redis.get('w611:lock');
    const wrong = await redis.compareAndDelete('w611:lock', 'not-the-owner');
    const stillThere = await redis.get('w611:lock');
    const right = await redis.compareAndDelete('w611:lock', ownerVal);
    const gone = await redis.get('w611:lock');
    chk('R5 CAS-del: توکنِ غلط رد، توکنِ درست آزاد', !wrong && stillThere === ownerVal && !!right && gone == null,
      JSON.stringify({ wrong, stillThere, right, gone }));

    /* ── R6: sAdd/sMembers/sRem ── */
    await redis.sAdd('w611:set', 'a'); await redis.sAdd('w611:set', 'b'); await redis.sAdd('w611:set', 'a');
    const mem1 = (await redis.sMembers('w611:set')).sort();
    await redis.sRem('w611:set', 'a');
    const mem2 = await redis.sMembers('w611:set');
    chk('R6 مجموعه: یکتایی + حذف', JSON.stringify(mem1) === '["a","b"]' && JSON.stringify(mem2) === '["b"]',
      JSON.stringify({ mem1, mem2 }));

    /* ── R7: publish/subscribe بین دو کلاینتِ کاملاً جدا ── */
    {
      const other = new RedisLib(ctx.url);
      other.on('error', () => {});
      let got = null;
      const gotP = new Promise((res) => {
        redis.subscribe('w611:chan', (msg) => { got = msg; res(); });
      });
      await sleep(300); /* subscription settle */
      await other.publish('w611:chan', 'cross-instance');
      await Promise.race([gotP, sleep(3000)]);
      try { other.disconnect(); } catch (e) {}
      chk('R7 pub/sub بین‌نمونه‌ای: پیامِ کلاینتِ دیگر می‌رسد', got === 'cross-instance', 'got=' + got);
    }

    /* ── R8: denylist ابطالِ نشست — الگوی revoked:<jti> ── */
    await redis.set('revoked:test-jti', '1', 'EX', 2);
    const rv1 = await redis.get('revoked:test-jti');
    const rvttl = await redis.ttl('revoked:test-jti');
    chk('R8 denylist ابطال: کلید هست و TTL = باقیِ عمر', rv1 === '1' && rvttl > 0 && rvttl <= 2, 'ttl=' + rvttl);

    /* ═══ موج ۱۱ — Cache Hierarchy روی L2ِ واقعی ═══ */
    await cache.init();

    /* ── C1: L2 set→get→ttl — امضای واقعی: (userId, data) و مدرسه از data.school.id ── */
    await cache.setBootstrapCache(990001, { school: { id: 7701 }, hello: 'w11', n: 42 });
    const hit = await cache.getBootstrapCache(990001);
    chk('C1a L2/L1 hit پس از set', !!hit && hit.hello === 'w11' && hit.n === 42, JSON.stringify(hit));

    /* راستی‌آزماییِ L2 مستقل از L1: کلیدِ خام در Redis واقعی هست و TTL دارد */
    let l2Key = null;
    {
      const probe = new RedisLib(ctx.url);
      probe.on('error', () => {});
      const keys = await probe.keys('*990001*');
      l2Key = keys.find((k) => /cache|bootstrap/.test(k)) || keys[0] || null;
      let l2ttl = -99;
      if (l2Key) l2ttl = await probe.ttl(l2Key);
      chk('C1b کلیدِ L2 واقعاً در Redis نشسته و TTL منطقی دارد',
        !!l2Key && l2ttl > 0 && l2ttl <= 3600, 'key=' + l2Key + ' ttl=' + l2ttl);
      try { probe.disconnect(); } catch (e) {}
    }

    /* ── C2: invalidateUser ⇒ خوانشِ بعدی miss ── */
    await cache.invalidateUser(990001);
    const afterInv = await cache.getBootstrapCache(990001);
    chk('C2 invalidateUser: خوانشِ بعدی miss است', afterInv == null, JSON.stringify(afterInv));

    /* ── C3: ابطالِ مدرسه‌ای از راهِ ایندکسِ sAdd ── */
    await cache.setBootstrapCache(990002, { school: { id: 7702 }, v: 1 });
    await cache.setBootstrapCache(990003, { school: { id: 7702 }, v: 2 });
    await cache.invalidateSchool(7702);
    const s1 = await cache.getBootstrapCache(990002);
    const s2 = await cache.getBootstrapCache(990003);
    chk('C3 invalidateSchool: هر دو کاربرِ مدرسه miss می‌شوند', s1 == null && s2 == null,
      JSON.stringify({ s1, s2 }));

    /* ── C4: stampede — ۵۰ خوانندهٔ سردِ هم‌زمان ⇒ ۱ تولید ── */
    {
      let builds = 0;
      const build = async () => { builds++; await sleep(150); return { built: true }; };
      const res = await Promise.all(Array.from({ length: 50 }, () => cache.withSingleFlight('w611:sf', build)));
      chk('C4 single-flight: ۵۰ فراخوانِ هم‌زمان ⇒ فقط ۱ تولید', builds === 1 && res.every((r) => r && r.built),
        'builds=' + builds);
    }

    /* ── C5: epochِ ابطال (W11-2) — ورودیِ خالص-L2ِ کهنه پس از ابطال رد می‌شود ── */
    {
      await cache.setBootstrapCache(990004, { school: { id: 7703 }, stale: 'candidate' });
      /* سناریوی W11-2 واقعی: ورودیِ «خالص-L2» — L1 این نمونه را خالی می‌کنیم
         (مثل نمونهٔ دیگر/ری‌استارت)، بعد کلیدِ L2 را مستقیم با پاکتِ epochِ
         کهنه برمی‌گردانیم و ابطال می‌زنیم؛ خوانشِ L2-hit باید رد کند. */
      const probe2 = new RedisLib(ctx.url); probe2.on('error', () => {});
      const rawEnv = await probe2.get('payesh:cache:bootstrap:990004');
      await cache.invalidateSchool(7703);
      if (cache.setL1MaxEntries) { cache.setL1MaxEntries(0); cache.setL1MaxEntries(10000); }
      await probe2.set('payesh:cache:bootstrap:990004', rawEnv, 'EX', 300); /* بازگشتِ ورودیِ کهنه به L2 */
      try { probe2.disconnect(); } catch (e) {}
      const stale = await cache.getBootstrapCache(990004);
      chk('C5 epochِ ابطال: L2-hitِ کهنه پس از invalidateSchool رد می‌شود', stale == null, JSON.stringify(stale));
    }
  } finally {
    try { await redis.close(); } catch (e) {}
    if (ctx.proc) { try { ctx.proc.kill('SIGKILL'); } catch (e) {} }
  }
  finish();
}

main().catch((e) => { console.error('live redis gate crashed:', e); process.exit(1); });
