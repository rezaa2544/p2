#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   wave11-cache.js — Wave 11: Cache (TTL، invalidation، stampede)
   ─────────────────────────────────────────────────────────────
   C1  TTL: L2 با EX (≤۳۰s) + L1 و بازگرداندن از L2 پس از خالی‌شدن L1
       + عضویت در ایندکسِ «مدرسه ⇒ کاربرانِ کش‌شده»
   C2  Invalidation: تغییرِ collection با school_id ⇒ انقضایِ L2 کاربرانِ
       همان مدرسه (از ایندکس) + PUBLISH برایِ نمونه‌هایِ دیگر + اثرِ
       نداشتن روی مدرسهٔ دیگر
   C3  انقضایِ کاملِ L2 حتی برایِ کاربرانی که در L1ِ این نمونه نیستند
       (باگِ پیشین: فقط L1-resident پاک می‌شدند و بقیه تا TTL می‌ماندند)
   C4  LRU + سقف: تکمیلِ سقف ⇒ خروجِ قدیمی‌ترین + refresh با دسترسی
   C5  Single-flight: ۱۰ فراخوانِ هم‌زمانِ یک کلید ⇒ یک build
   C6  bootstrap route: ۲ درخواستِ هم‌زمانِ سرد ⇒ یک set + پاسخِ یکسان؛
       درخواستِ سوم از کش (cached:true)
   fake: mini-redisِ سازگار با قرارداد (TTL + SET/EX/NX + اسکرپت‌ها +
   دستوراتِ Set) — بدونِ ردیسِ زنده.
   ───────────────────────────────────────────────────────────── */
'use strict';
const redis = require('../server/redis.js');
const cache = require('../server/cache.js');
const { createBootstrapRoute } = require('../server/routes/bootstrap.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

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
  console.log('\n▸ Wave11-C — استراتژی کش (TTL، invalidation، stampede)');

  /* ── C1: TTL + L1/L2 + ایندکسِ مدرسه ── */
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

  /* ── C2: Invalidation با school_id (مسیرِ sync/REST) ── */
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

  /* ── C3: انقضایِ کاملِ L2 حتی بیرونِ L1 (باگِ پیشین) ── */
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

  /* ── C4: LRU + سقف ── */
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

  /* ── C5: Single-flight (stampede protection) ── */
  {
    let builds = 0;
    const slow = () => new Promise(res => setTimeout(() => { builds++; res('value-' + builds); }, 30));
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.withSingleFlight('hot-key', slow)));
    chk('C5a single-flight: ۱۰ فراخوانِ هم‌زمان ⇒ دقیقاً یک build', builds === 1, 'builds=' + builds);
    chk('C5b single-flight: همهٔ فراخوانِ همان نتیجه را می‌گیرند',
      results.every(r => r === 'value-1') && cache.__inflightForTests() === 0,
      'res=' + [...new Set(results)].join('|') + ' inflight=' + cache.__inflightForTests());
    /* buildِ دوم (بعد از خالی‌شدن) دوباره مجاز است */
    const again = await cache.withSingleFlight('hot-key', slow);
    chk('C5c single-flight: پس از اتمام، کلید دوباره قابلِ build است', again === 'value-2' && builds === 2);
  }

  /* ── C6: bootstrap route — stampede در مسیرِ واقعی + cached hit ── */
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
    /* انقضایِ مدرسه (مثلِ ثبتِ نمره) کشِ این کاربر را هم می‌زند */
    await cache.invalidateCollection('grades', 1);
    const r4 = await route.getBootstrapData(req);
    chk('C6d route: پس از انقضایِ مدرسه، پاسخِ تازه (نه cached)',
      r4.status === 200 && r4.cached !== true, 'cached=' + r4.cached);
    redis.__setClientForTests(null);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`wave11-cache: ${okc + failc} بررسی — ✅ ${okc} · ❌ ${failc}`);
  if (failc) process.exit(1);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
