#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   wave6-redis.js — Wave 6: Redis و Distributed State
   ─────────────────────────────────────────────────────────────
   R1  OTP state: ردیس منبعِ حقیقت (فلاش/بازخوانی/ادغامِ سنگ‌قبر)
   R2  OTP rate limit: اتمیک (EVALِ INCR+EXPIRE) + TTL + سقفِ دقیق
   R3  WAF rate limit: اتمیک (نه GET+SET) + سقفِ دقیق زیر burst
   R4  Session revocation: denylist با TTL + sessver
   R5  Idempotency: کلیدِ ۲۴ساعته
   R6  Lock: SET … EX … NX + رهاکردنِ CAS (فقط مالک)
   R7  Readiness: تولید بدونِ ردیسِ زنده ⇒ «آماده نیست» (کودفرزند)
   R8  نگهبانِ شمارشِ شناسه (R97): شمارنده روی Redis + TTL + مراحل
   fake: clientِ سازگار با قرارداد (mini-redis با TTL و دو اسکرپتِ
   معروف) — بدونِ ردیسِ زنده؛ انضباطِ دستورات (EX/NX/TTL) می‌سنجد.
   ───────────────────────────────────────────────────────────── */
'use strict';
const redis = require('../server/redis.js');
const revocation = require('../server/revocation.js');
const cache = require('../server/cache.js');
const rateLimit = require('../server/rate-limit.js');
const { createOtpStore } = require('../server/otp-store.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const lockStub = { acquireLock: async () => 'tok', releaseLock: async () => true };

/* mini-redis — رفتارِ قراردادیِ دستوراتی که redis.js می‌خواند */
function fakeRedis() {
  const m = new Map(); /* key -> { v, exp } — exp: ms مطلق یا null */
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
    async incr(k) {
      commands.push(['INCR', k]);
      const it = live(k);
      const n = it ? (parseInt(it.v, 10) + 1) : 1;
      m.set(k, { v: String(n), exp: it ? it.exp : null });
      return n;
    },
    async expire(k, s) {
      commands.push(['EXPIRE', k, s]);
      const it = live(k);
      if (!it) return 0;
      if (!(s > 0)) { m.delete(k); return 1; }
      it.exp = Date.now() + s * 1000;
      return 1;
    },
    async ttl(k) {
      commands.push(['TTL', k]);
      const it = live(k);
      if (!it) return -2;
      if (!it.exp) return -1;
      return Math.max(0, Math.ceil((it.exp - Date.now()) / 1000));
    },
    async scan() { commands.push(['SCAN']); return ['0', Array.from(m.keys())]; },
    async publish(ch) { commands.push(['PUBLISH', ch]); return 1; },
    async subscribe(ch) { commands.push(['SUBSCRIBE', ch]); },
    async ping() { commands.push(['PING']); return 'PONG'; },
    async eval(script, numKeys, key, arg) {
      commands.push(['EVAL', script.slice(0, 24).replace(/\s+/g, ' '), key]);
      if (script.indexOf('INCR') >= 0 && script.indexOf('EXPIRE') >= 0) { /* INCR_WITH_TTL */
        const it = live(key);
        const n = it ? (parseInt(it.v, 10) + 1) : 1;
        m.set(key, { v: String(n), exp: Date.now() + arg * 1000 });
        return n;
      }
      if (script.indexOf('ARGV[1]') >= 0) { /* CAS DEL */
        const it = live(key);
        if (it && it.v === arg) { m.delete(key); return 1; }
        return 0;
      }
      return 0;
    },
    disconnect() { commands.push(['DISCONNECT']); }
  };
}
const hadCmd = (fake, first) => fake.commands.some(c => c[0] === first);
const setCmdsFor = (fake, key) => fake.commands.filter(c => c[0] === 'SET' && c[1] === key);

(async () => {
  console.log('\n▸ Wave6-R — Redis و Distributed State (fake client سازگار با قرارداد)');

  /* ── R1: OTP state روی ردیس ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const ttlMs = 5 * 60 * 1000;
    const o1 = createOtpStore({ file: '/tmp/wave6-otp1.json', ttlMs, redis, cache: lockStub });
    const o2 = createOtpStore({ file: '/tmp/wave6-otp2.json', ttlMs, redis, cache: lockStub });
    o1.data.codes['09120000001'] = { h: 'aabb', at: Date.now(), user_id: 7, tries: 0 };
    o1.save();
    await o1.flush();
    const doc1 = JSON.parse(fake.m.get('payesh:otp:state').v);
    chk('R1a OTP: state در کلیدِ payesh:otp:state (با seq) روی ردیس',
      !!doc1 && doc1.seq >= 1 && !!doc1.codes['09120000001'], JSON.stringify(doc1 && doc1.seq));
    await o2.reloadIfChanged();
    chk('R1b OTP: نمونهٔ خواهر کدِ نمونهٔ دیگر را می‌بیند (ادغام از ردیس)',
      !!o2.data.codes['09120000001']);
    o1.deleteCode('09120000001'); /* مصرف ⇒ سنگ‌قبر */
    o1.save();
    await o1.flush();
    await o2.reloadIfChanged();
    chk('R1c OTP: کدِ مصرف‌شده با سنگ‌قبر در همهٔ نمونه‌ها می‌میرد',
      !o2.data.codes['09120000001'] && !!o2.data.tomb['09120000001']);
    redis.__setClientForTests(null);
  }

  /* ── R2: OTP rate limit اتمیک + TTL + سقف ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    let allowed = 0;
    for (let i = 0; i < 5; i++) {
      const r = await rateLimit.checkRateLimit({ prefix: 'otp:send:phone', identifier: '09120000002', limit: 3, windowSeconds: 60 });
      if (r.allowed) allowed++;
    }
    const t = await redis.ttl('rate:otp:send:phone:09120000002');
    chk('R2a rate: سقف دقیق (۳ از ۵) با شمارشِ اتمیک', allowed === 3, 'allowed=' + allowed);
    chk('R2b rate: از مسیرِ اتمیک (EVALِ INCR+EXPIRE) با TTL می‌رود',
      hadCmd(fake, 'EVAL') && t > 0 && t <= 60, 'ttl=' + t);
    redis.__setClientForTests(null);
  }

  /* ── R3: WAF rate limit اتمیک (نه GET+SET) ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      cache.checkRateLimit('1.2.3.4', 'waf:ip', 5, 60)));
    const allowed = results.filter(r => r.allowed).length;
    const t = await redis.ttl('payesh:rl:waf:ip:1.2.3.4');
    chk('R3a waf-rate: burstِ ۱۲ ⇒ دقیقاً ۵ مجاز (اتومیک)', allowed === 5, 'allowed=' + allowed);
    chk('R3b waf-rate: اتمیک (EVAL) + TTL روی کلید',
      hadCmd(fake, 'EVAL') && t > 0 && t <= 60, 'ttl=' + t);
    redis.__setClientForTests(null);
  }

  /* ── R4: Session revocation ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const ok = await revocation.revokeSession('jti-wave6', 100);
    const t = await redis.ttl('revoked:jti-wave6');
    chk('R4a revocation: jti در denylist با TTL (EX)', ok === true && t > 0 && t <= 100, 'ttl=' + t);
    chk('R4b revocation: isRevoked از ردیس می‌خواند', await revocation.isRevoked('jti-wave6') === true);
    const v1 = await revocation.revokeAllUserSessions(7);
    const v2 = await revocation.revokeAllUserSessions(7);
    chk('R4c revocation: نسخهٔ نشست (sessver) اتمیک و رو به رشد',
      v1 === 1 && v2 === 2 && (await revocation.getSessionVersion(7)) === 2,
      'v1=' + v1 + ' v2=' + v2);
    redis.__setClientForTests(null);
  }

  /* ── R5: Idempotency ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    chk('R5a idempotency: uidِ تازه هنوز پردازش‌نشده', (await cache.isProcessedUid('uid-w6-1')) === false);
    await cache.markProcessedUid('uid-w6-1');
    const t = await redis.ttl('payesh:idempotency:uid-w6-1');
    chk('R5b idempotency: ثبت با TTLِ ۲۴ساعته (نه دائمی)',
      (await cache.isProcessedUid('uid-w6-1')) === true && t > 0 && t <= 86400, 'ttl=' + t);
    redis.__setClientForTests(null);
  }

  /* ── R6: Lock — NX+EX و رهاکردنِ CAS ── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const t1 = await cache.acquireLock('ids:attendance', 5);
    const setArgs = setCmdsFor(fake, 'payesh:lock:ids:attendance')[0] || [];
    chk('R6a lock: دریافت = SET … EX … NX (اتمیک)',
      !!t1 && setArgs.indexOf('EX') >= 0 && setArgs.indexOf('NX') >= 0, JSON.stringify(setArgs));
    const t2 = await cache.acquireLock('ids:attendance', 5);
    chk('R6b lock: دومین درخواست‌دهنده قفل را نمی‌گیرد', t2 === null, 't2=' + t2);
    chk('R6c lock: رهاکردنِ غیرواقع با tokenِ غلط رد می‌شود (CAS)',
      (await cache.releaseLock('ids:attendance', 't-غیره')) === false
      && (await cache.acquireLock('ids:attendance', 5)) === null);
    chk('R6d lock: رهاکردن با tokenِ مالک ⇒ آزاد',
      (await cache.releaseLock('ids:attendance', t1)) === true
      && !!(await cache.acquireLock('ids:attendance', 5)));
    redis.__setClientForTests(null);
  }

  /* ── R7: Readiness — تولید بدونِ ردیسِ زنده ⇒ آماده نیست ── */
  {
    const { spawnSync } = require('child_process');
    const script =
      "const cache=require('./server/cache');const redis=require('./server/redis');" +
      "cache.init().then(async r=>{const p=await redis.ping();" +
      "console.log(JSON.stringify({ok:!!(r&&r.ok),driver:(r&&r.driver)||p.driver,ready:redis.ready()}));process.exit(0);})" +
      ".catch(e=>{console.log(JSON.stringify({ok:false,driver:'crash',ready:false}));process.exit(0);});";
    const prod = spawnSync(process.execPath, ['-e', script], {
      cwd: __dirname + '/..', encoding: 'utf8', timeout: 45000,
      env: Object.assign({}, process.env, { NODE_ENV: 'production', REDIS_URL: 'redis://127.0.0.1:9' })
    });
    let prodOut = {};
    try { prodOut = JSON.parse(String(prod.stdout).trim().split('\n').pop()); } catch (e) {}
    chk('R7a readiness: production + REDIS_URLِ نالایق ⇒ init شکست + ready=false (پس‌زمینهٔ حافظه ممنوع)',
      prodOut.ok === false && prodOut.ready === false && prodOut.driver !== 'memory',
      JSON.stringify(prodOut));
    const dev = spawnSync(process.execPath, ['-e', script], {
      cwd: __dirname + '/..', encoding: 'utf8', timeout: 45000,
      env: Object.assign({}, process.env, { NODE_ENV: 'development' })
    });
    let devOut = {};
    try { devOut = JSON.parse(String(dev.stdout).trim().split('\n').pop()); } catch (e) {}
    chk('R7b readiness: توسعه (بدون REDIS_URL) ⇒ درایورِ حافظه، ready=true (Zero-Disruption)',
      devOut.ok === true && devOut.driver === 'memory' && devOut.ready === true,
      JSON.stringify(devOut));
  }

  /* ── R8: نگهبانِ شمارشِ شناسه (R97) روی ردیس ── */
  {
    const srv = require('../server/index.js');
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    const { enumTouch, enumRead, enumDelayMs, enumStage, enumKey } = srv.__enumForTests;
    const sess = { id: 42, jti: 'jti-enum-w6' };
    const n1 = await enumTouch(sess);
    const n2 = await enumTouch(sess);
    const t = await redis.ttl(enumKey(sess));
    chk('R8a enum: شمارنده روی ردیس (INCR اتمیک) + TTLِ پنجرهٔ ۱۰دقیقه',
      n1 === 1 && n2 === 2 && t > 0 && t <= 600, 'n=' + n2 + ' ttl=' + t);
    chk('R8b enum: خوانشِ شمارنده از ردیس (بدونِ نوشتنِ store)',
      (await enumRead(sess)) === 2 && !srv.store.__auth.enum,
      'read=' + (await enumRead(sess)));
    chk('R8c enum: مراحلِ تأخیر بر پایهٔ شمارشِ ردیس',
      enumDelayMs(0) === 0 && enumDelayMs(99) === 0 && enumDelayMs(100) === 500 && enumDelayMs(500) === 2000,
      '100=' + enumDelayMs(100) + ' 500=' + enumDelayMs(500));
    /* REVOKE: ابطالِ محلی + توزیع‌شده (denylist) */
    await enumStage(2000, sess);
    await new Promise(r => setTimeout(r, 20));
    chk('R8d enum: REVOKE ⇒ ابطالِ توزیع‌شده در denylistِ ردیس + محلی',
      !!srv.store.__revoked_jti[sess.jti] && (await redis.get('revoked:' + sess.jti)) != null,
      'local=' + !!srv.store.__revoked_jti[sess.jti] + ' redis=' + (await redis.get('revoked:' + sess.jti)));
    redis.__setClientForTests(null);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`wave6-redis: ${okc + failc} بررسی — ✅ ${okc} · ❌ ${failc}`);
  if (failc) process.exit(1);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
