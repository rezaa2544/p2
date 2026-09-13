#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   wave11-cache.js — Wave 11: Cache (L1/L2 Bootstrap، ابطال، TTL،
   stampede، قفل، idempotency، Pub/Sub، epoch)
   -------------------------------------------------------------------
   ادغامِ keep-both (باگ‌هانت چت ۵، نشست ۴): سوئیتِ یکپارچگیِ موج ۱۱
   (نشست ۳ — رفت‌وبرگشت/ابطال/epoch/ریت‌لیمیت/قفل/idempotency/Pub/Sub/
   آمار/ابطال سراسری) + سوئیتِ استراتژی کش (main — TTL/ایندکس مدرسه/
   انقضای کامل/LRU/single-flight/bootstrap route).
   باگ‌هایِ عمیق‌تر در سوئیت‌هایِ اختصاصی‌اند (cache-l2-epoch، redis-mem-ttl).
   ───────────────────────────────────────────────────────────── */
'use strict';
const cache = require('../server/cache.js');
const redis = require('../server/redis.js');
const rateLimit = require('../server/rate-limit.js');
const { classifyKey } = require('../tools/redis-audit.js');
const { createBootstrapRoute } = require('../server/routes/bootstrap.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const P = (uid, schoolId, tag) => ({ user: { id: uid }, school: { id: schoolId }, tag });

/* ── fake redis (main) ── */
function fakeRedis() {
  const m = new Map();   /* key -> { v, exp } */
  const sets = new Map(); /* key -> Set<string> */
  const commands = [];
  const live = (k) => {
    const it = m.get(k);
    if (!it) return null;
    if (it.exp && Date.now() >= it.exp) { m.delete(k); return null; }
    return it;
  };
  return {
    commands, m,
    async get(k) { commands.push(['GET', k]); const it = live(k); return it ? it.v : null; },
    async set(k, v, ...rest) {
      commands.push(['SET', k, ...rest.map(String)]);
      let nx = false, exp = null;
      for (let i = 0; i < rest.length; i++) {
        const t = String(rest[i]).toUpperCase();
        if (t === 'NX') nx = true;
        else if (t === 'EX') exp = Date.now() + rest[++i] * 1000;
        else if (t === 'PX') exp = Date.now() + rest[++i];
      }
      if (nx && live(k)) return null;
      m.set(k, { v: String(v), exp });
      return 'OK';
    },
    async del(...ks) { commands.push(['DEL', ...ks]); let n = 0; for (const k of ks) { if (m.delete(k)) n++; } return n; },
    async incr(k) { commands.push(['INCR', k]); const it = live(k); const n = it ? (parseInt(it.v, 10) + 1) : 1; m.set(k, { v: String(n), exp: it ? it.exp : null }); return n; },
    async expire(k, s) { commands.push(['EXPIRE', k, s]); const it = live(k); if (!it) return 0; if (!(s > 0)) { m.delete(k); return 1; } it.exp = Date.now() + s * 1000; return 1; },
    async ttl(k) { commands.push(['TTL', k]); const it = live(k); if (!it) return -2; if (!it.exp) return -1; return Math.max(0, Math.ceil((it.exp - Date.now()) / 1000)); },
    async sAdd(k, ...ms) { commands.push(['SADD', k, ...ms]); if (!sets.has(k)) sets.set(k, new Set()); const s = sets.get(k); let n = 0; for (const x of ms) { if (!s.has(String(x))) { s.add(String(x)); n++; } } return n; },
    async sMembers(k) { commands.push(['SMEMBERS', k]); const s = sets.get(k); return s ? Array.from(s) : []; },
    async sRem(k, ...ms) { commands.push(['SREM', k, ...ms]); const s = sets.get(k); if (!s) return 0; let n = 0; for (const x of ms) { if (s.delete(String(x))) n++; } return n; },
    async scan() { commands.push(['SCAN']); return ['0', Array.from(m.keys())]; },
    async publish(ch) { commands.push(['PUBLISH', ch]); return 1; },
    async subscribe(ch) { commands.push(['SUBSCRIBE', ch]); },
    async ping() { commands.push(['PING']); return 'PONG'; },
    async eval(script, numKeys, key, arg) {
      commands.push(['EVAL', script.slice(0, 24).replace(/\s+/g, ' '), key]);
      if (script.indexOf('INCR') >= 0 && script.indexOf('EXPIRE') >= 0) {
        const it = live(key); const n = it ? (parseInt(it.v, 10) + 1) : 1;
        m.set(key, { v: String(n), exp: Date.now() + arg * 1000 });
        return n;
      }
      if (script.indexOf('ARGV[1]') >= 0) {
        const it = live(key);
        if (it && it.v === arg) { m.delete(key); return 1; }
        return 0;
      }
      return 0;
    },
    disconnect() { commands.push(['DISCONNECT']); }
  };
}
const data = (uid, schoolId) => ({ ok: true, user: { id: uid }, school: { id: schoolId, name: 'S' + schoolId } });

(async () => {
  console.log('\n▸ Wave 11 — Cache یکپارچه (driver=' + (redis.isRedis() ? 'redis' : 'memory') + ')');

  /* ═══════════ بخش ۱: سوئیتِ یکپارچگی (نشست ۳) ═══════════ */

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

  /* ═══════════ بخش ۲: سوئیتِ استراتژی کش (main) ═══════════ */

  /* ── C1 (main): TTL + L1/L2 + ایندکسِ مدرسه ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const l1 = cache.__l1ForTests();
    l1.clear();
    await cache.setBootstrapCache(11, data(11, 1), 300);
    const t = await redis.ttl('payesh:cache:bootstrap:11');
    const setMembers = await redis.sMembers('payesh:cache:school:1');
    chk('C1a کش: L2 با TTL (EX ≤ 300s) + عضویت در ایندکسِ مدرسه',
      t > 0 && t <= 300 && setMembers.indexOf('11') >= 0, 'ttl=' + t + ' set=' + setMembers.join(','));
    const hit1 = await cache.getBootstrapCache(11);
    chk('C1b کش: L1 می‌زند (بدونِ خوانشِ جدید از L2)', hit1 && hit1.user.id === 11 && l1.has(11));
    const beforeGets = fake.commands.filter(c => c[0] === 'GET' && c[1] === 'payesh:cache:bootstrap:11').length;
    await cache.getBootstrapCache(11);
    const afterGets = fake.commands.filter(c => c[0] === 'GET' && c[1] === 'payesh:cache:bootstrap:11').length;
    chk('C1c کش: L1 hit بدونِ رفتن به L2', beforeGets === afterGets, 'gets=' + beforeGets + '→' + afterGets);
    l1.clear();
    const hit2 = await cache.getBootstrapCache(11);
    chk('C1d کش: پس از خالی‌شدن L1، L2 پاسخ می‌دهد و L1 پر می‌شود',
      hit2 && hit2.user.id === 11 && l1.has(11));
    redis.__setClientForTests(null);
  }

  /* ── C2 (main): Invalidation با school_id ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    cache.__l1ForTests().clear();
    await cache.setBootstrapCache(21, data(21, 1), 300);
    await cache.setBootstrapCache(22, data(22, 2), 300);
    await cache.invalidateCollection('grades', 1);
    const t1 = await redis.ttl('payesh:cache:bootstrap:21');
    const t2 = await redis.ttl('payesh:cache:bootstrap:22');
    const pub = fake.commands.filter(c => c[0] === 'PUBLISH' && c[1] === 'payesh:pubsub:inval').length;
    chk('C2a انقضا: کاربرِ مدرسهٔ تغییریافته از L2 پاک (TTL=-2)', t1 === -2, 'ttl=' + t1);
    chk('C2b انقضا: مدرسهٔ دیگر دست‌نخورده', t2 > 0 && t2 <= 300, 'ttl=' + t2);
    chk('C2c انقضا: رویدادِ pub/sub برایِ نمونه‌هایِ دیگر منتشر شد', pub >= 1, 'pub=' + pub);
    redis.__setClientForTests(null);
  }

  /* ── C3 (main): انقضایِ کاملِ L2 حتی بیرونِ L1 ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    cache.__l1ForTests().clear();
    await cache.setBootstrapCache(31, data(31, 1), 300);
    await cache.setBootstrapCache(32, data(32, 2), 300);
    cache.__l1ForTests().clear(); /* کاربرِ 31 دیگر در L1ِ این نمونه نیست */
    chk('C3a پیش‌زمینه: 31 در L2 هست ولی در L1 نیست',
      (await redis.ttl('payesh:cache:bootstrap:31')) > 0 && !cache.__l1ForTests().has(31));
    await cache.invalidateSchool(1);
    const t1 = await redis.ttl('payesh:cache:bootstrap:31');
    const t2 = await redis.ttl('payesh:cache:bootstrap:32');
    chk('C3b انقضایِ کامل: 31 از L2 پاک شد فقط با ایندکس (بدونِ L1)', t1 === -2, 'ttl=' + t1);
    chk('C3c انقضایِ کامل: 32 (مدرسهٔ دیگر) در L2 می‌ماند', t2 > 0, 'ttl=' + t2);
    redis.__setClientForTests(null);
  }

  /* ── C4 (main): LRU + سقف ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const l1 = cache.__l1ForTests();
    l1.clear();
    l1.setMax(2);
    await cache.setBootstrapCache(41, data(41, 1), 300);
    await cache.setBootstrapCache(42, data(42, 1), 300);
    await cache.setBootstrapCache(43, data(43, 1), 300); /* 41 خارج می‌شود */
    chk('C4a LRU: سقف ۲ ⇒ قدیمی‌ترین (41) از L1 خارج؛ L2 دست‌نخورده',
      l1.size === 2 && !l1.has(41) && l1.has(42) && l1.has(43)
      && (await redis.ttl('payesh:cache:bootstrap:41')) > 0, 'size=' + l1.size);
    await cache.getBootstrapCache(42); /* 42 تازه می‌شود */
    await cache.setBootstrapCache(44, data(44, 1), 300); /* حالا 43 (قدیمی‌ترین) خارج می‌شود */
    chk('C4b LRU: دسترسیِ مجدد ⇒ جایگاهِ تازه (43 خارج، 42 می‌ماند)',
      !l1.has(43) && l1.has(42) && l1.has(44), 'has43=' + l1.has(43));
    const still = await cache.getBootstrapCache(43);
    chk('C4c LRU: خروج از L1، دسترسی را نمی‌بندد (L2 می‌دهد)', !!still && still.user.id === 43);
    redis.__setClientForTests(null);
  }

  /* ── C5 (main): Single-flight ── */
  {
    let builds = 0;
    const slow = () => new Promise(res => setTimeout(() => { builds++; res('value-' + builds); }, 30));
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.withSingleFlight('hot-key', slow)));
    chk('C5a single-flight: ۱۰ فراخوانِ هم‌زمان ⇒ دقیقاً یک build', builds === 1, 'builds=' + builds);
    chk('C5b single-flight: همهٔ فراخوانِ همان نتیجه را می‌گیرند',
      results.every(r => r === 'value-1') && cache.__inflightForTests() === 0,
      'res=' + [...new Set(results)].join('|') + ' inflight=' + cache.__inflightForTests());
    const again = await cache.withSingleFlight('hot-key', slow);
    chk('C5c single-flight: پس از اتمام، کلید دوباره قابلِ build است', again === 'value-2' && builds === 2);
  }

  /* ── C6 (main): bootstrap route — stampede + cached hit ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const l1 = cache.__l1ForTests();
    l1.clear();
    const store = {
      schools: [{ id: 1, name: 'مدرسهٔ تست', type: 'معمولی', capabilities: [] }],
      users: [{ id: 50, role: 'student', school_id: 1, full_name: 'دانش‌آموزِ تست' }],
      enrollments: [{ student_id: 50, class_id: 1, school_id: 1 }],
      classes: [{ id: 1, name: 'یکم الف', grade: 1, school_id: 1, capacity: 30 }],
      schedule: [], bell_schedules: [], notifications: []
    };
    const route = createBootstrapRoute({ store });
    const req = { user: { id: 50, role: 'student', school_id: 1 } };
    const origSet = cache.setBootstrapCache;
    let sets = 0;
    cache.setBootstrapCache = async (...a) => { sets++; return origSet(...a); };
    const [r1, r2] = await Promise.all([route.getBootstrapData(req), route.getBootstrapData(req)]);
    cache.setBootstrapCache = origSet;
    chk('C6a route: ۲ درخواستِ هم‌زمانِ سرد ⇒ یک set (single-flight)',
      r1.status === 200 && r2.status === 200 && sets === 1, 'sets=' + sets);
    chk('C6b route: پاسخ‌هایِ یکسان',
      JSON.stringify(r1.body) === JSON.stringify(r2.body) && r1.body.user.id === 50);
    const r3 = await route.getBootstrapData(req);
    chk('C6c route: درخواستِ سوم از کش (cached:true)',
      r3.status === 200 && r3.cached === true && JSON.stringify(r3.body) === JSON.stringify(r1.body),
      'cached=' + r3.cached);
    await cache.invalidateCollection('grades', 1);
    const r4 = await route.getBootstrapData(req);
    chk('C6d route: پس از انقضایِ مدرسه، پاسخِ تازه (نه cached)',
      r4.status === 200 && r4.cached !== true, 'cached=' + r4.cached);
    redis.__setClientForTests(null);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`wave11-cache: ${okc + failc} بررسی — ✅ ${okc} · ❌ ${failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
