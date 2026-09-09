#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ ابطالِ نشست (Session Revocation Denylist — کنترلِ پیشگیرانه P4)
   ───────────────────────────────────────────────────────────────────
   R1  خروج ⇒ توکن دیگر کار نمی‌کند (HTTP واقعی، /api/auth/me ⇒ ۴۰۱)
   R2  پیش از خروج همان توکن ۲۰۰ است (سنجه‌ی سالم‌بودنِ مسیر)
   R3  ابطال در L1 با «عدد» نوشته می‌شود (قراردادِ GC / restore)
   R4  نمونه‌ی دوم از راهِ Pub/Sub همان لحظه مطلع می‌شود (توزیع‌شدگی)
   R5  نمونه‌ی سوم بی‌اشتراک، از راهِ L2 (Redis) می‌فهمد — پشتبان
   R6  خطایِ خواندن ⇒ رد (fail-closed)، نه رد شدن از کنارش
   R7  بی‌Redis (تک‌نمونه‌ای) ⇒ هیچ ۴۰۱ تازه‌ای (رفتارِ امروز دست‌نخورده)
   R8  «ابطالِ همه‌ی نشست‌هایِ یک کاربر» هر سه نشست را می‌کشد
   R9  ...و حتی وقتی این نمونه دفتر را ندارد (راه‌اندازیِ تازه) از L2 می‌خواند
   R10 کلیدها با EX = عمرِ نشست (۲۸۸۰۰ ثانیه) نوشته می‌شوند
   R11 نشست هنگامِ ورود در دفترِ کاربر ثبت می‌شود
   R12 مسیرهایِ send-code/login/logout با کلوچه‌ی مرده هم باز می‌مانند
       (وگرنه کاربر برای همیشه قفل می‌شد)
   R13 حذفِ حساب ⇒ نشستِ دستگاهِ دیگر هم می‌میرد
   R14 حذفِ حساب ⇒ رویدادِ آدیتِ sessions_revoked ثبت می‌شود

   اجرا: node tests/session-revocation.js   (نیازمند seed: node server/seed.js)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if(!fs.existsSync(REAL_STORE)){
  console.log('⏭️  store موجود نیست — اول: node server/seed.js');
  process.exit(0);
}

/* ── فایل‌هایِ ایزوله برای این اجرا ───────────────────────────────── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rev-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch(e){} });
const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_SMS_COOLDOWN_S = '0';
process.env.PAYESH_SMS_DAILY_CAP = '1000000';
process.env.PAYESH_SMS_PHONE_LIMIT = '1000000';
process.env.PAYESH_SMS_IP_LIMIT = '1000000';
process.env.PAYESH_LOGIN_IP_LIMIT = '1000000';
process.env.PAYESH_LOGIN_TRIES = '1000000';
/* کشِ پاسخِ منفی را در این اجرا عمداً کوتاه می‌کنیم (۶۰ میلی‌ثانیه) تا
   بتوان سنجید که «کِش، ابطال را برای همیشه پنهان نمی‌کند» — با مقدارِ
   پیش‌فرضِ ۵ ثانیه باید ۵ ثانیه صبر می‌کردیم. */
process.env.PAYESH_REVOKE_NEG_CACHE_MS = '60';

const { createRevocation } = require(path.join(ROOT, 'server', 'revocation.js'));

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0,200) : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── Redisِ ساختگی: رفتارِ واقعی را شبیه‌سازی می‌کند (برایِ واحدی) ──
   چرا ساختگی؟ چون لایه‌هایِ امنیتی فقط وقتی قابلِ آزمون‌اند که بشود
   «خرابیِ Redis» را هم ساخت. در اینجا خرابی = getStrict خطا می‌اندازد. */
function fakeRedis(opts){
  const o = opts || {};
  const kv = new Map();      /* key -> {v, exp} */
  const subs = new Map();
  const written = [];        /* ردِّ نوشتن‌ها برای سنجه‌ی TTL */
  return {
    _kv: kv, _written: written,
    __throw: !!o.throwOnGet,
    isRedis: () => o.active !== false,
    async get(k){
      const e = kv.get(k);
      if(!e) return null;
      if(e.exp && Date.now() > e.exp){ kv.delete(k); return null; }
      return e.v;
    },
    async getStrict(k){
      if(this.__throw) throw new Error('Redis unreachable (تزریق‌شده)');
      return await this.get(k);
    },
    async set(k, v, mode, dur){
      written.push({ k: k, v: v, mode: mode, dur: dur });
      kv.set(k, { v: String(v), exp: (mode === 'EX' && dur) ? Date.now() + dur * 1000 : 0 });
      return 'OK';
    },
    async del(...ks){ let n = 0; for(const k of ks.flat()){ if(kv.delete(k)) n++; } return n; },
    async publish(ch, msg){
      const cbs = subs.get(ch) || [];
      for(const cb of cbs){ try { cb(String(msg), ch); } catch(e){} }
      return cbs.length;
    },
    async subscribe(ch, cb){
      if(!subs.has(ch)) subs.set(ch, []);
      subs.get(ch).push(cb);
      return true;
    }
  };
}

async function main(){
  console.log('\n— بخشِ ۱: واحد (با Redisِ تزریقی) —');

  /* ── R10/R11/R8/R9/R6/R7 رویِ ماژول ───────────────────────────── */
  {
    const rd = fakeRedis({ active: true });
    const storeA = { __revoked_jti: {} };
    const A = createRevocation({ store: storeA, redis: rd, ttlS: 28800 });
    await A.init();

    await A.revokeSession('jt_one', 'logout');
    chk('R3 ابطال در L1 به‌شکلِ عدد نوشته می‌شود (قراردادِ GC/restore)',
        typeof storeA.__revoked_jti['jt_one'] === 'number', typeof storeA.__revoked_jti['jt_one']);
    chk('R10 کلیدِ ابطال با EX = عمرِ نشست (۲۸۸۰۰) نوشته می‌شود',
        rd._written.some(w => w.k === 'payesh:revoked:jt_one' && w.mode === 'EX' && w.dur === 28800),
        JSON.stringify(rd._written.slice(0, 2)));

    /* R11 — ثبتِ نشست هنگامِ ورود */
    A.trackSession(7, 'jt_a'); A.trackSession(7, 'jt_b'); A.trackSession(7, 'jt_c');
    chk('R11 نشست‌هایِ کاربر هنگامِ صدور ثبت می‌شوند',
        A.sessionsOf(7).length === 3, JSON.stringify(A.sessionsOf(7)));

    /* R8 — ابطالِ همه */
    const nAll = await A.revokeAllUserSessions(7, 'test');
    chk('R8 «ابطالِ همه‌ی نشست‌ها» هر سه نشست را می‌کشد',
        nAll === 3 && A.isRevoked('jt_a') && A.isRevoked('jt_b') && A.isRevoked('jt_c') && A.sessionsOf(7).length === 0,
        'count=' + nAll);

    /* R9 — نمونه‌ی تازه (دفتر محلی خالی) باید از L2 بخواند */
    const storeB = { __revoked_jti: {} };
    const B = createRevocation({ store: storeB, redis: rd, ttlS: 28800 });
    await B.init();
    B.trackSession(9, 'jt_x'); B.trackSession(9, 'jt_y');   /* در L2 نوشته می‌شود */
    const storeC = { __revoked_jti: {} };
    const C = createRevocation({ store: storeC, redis: rd, ttlS: 28800 }); /* بی‌دفترِ محلی */
    const nC = await C.revokeAllUserSessions(9, 'test');
    chk('R9 ابطالِ همه حتی بدونِ دفترِ محلی کار می‌کند (خواندن از L2)',
        nC === 2 && C.isRevoked('jt_x') && C.isRevoked('jt_y'), 'count=' + nC);

    /* R6 — خرابیِ Redis ⇒ رد (fail-closed) */
    rd.__throw = true;
    let denied = null;
    try { denied = await A.isRevokedAsync('jt_unknown_xyz'); }
    catch(e){ denied = 'threw:' + e.message; }
    chk('R6 خرابیِ خواندن از Redis ⇒ رد (fail-closed)، نه عبور', denied === true, String(denied));
    chk('R6b آمارِ «نامعلوم» ثبت می‌شود تا بشود پایشش کرد', A.snapshot().stats.unknown >= 1,
        JSON.stringify(A.snapshot().stats));
    rd.__throw = false;

    /* R7 — تک‌نمونه‌ای (بی‌Redis) نباید ۴۰۱ تازه بسازد */
    const rdOff = fakeRedis({ active: false });
    const storeD = { __revoked_jti: {} };
    const D = createRevocation({ store: storeD, redis: rdOff, ttlS: 28800 });
    await D.init();
    chk('R7 بی‌Redis: نشستِ ابطال‌نشده همچنان معتبر است (هیچ ۴۰۱ تازه)',
        (await D.isRevokedAsync('jt_fresh')) === false);
    await D.revokeSession('jt_fresh', 'logout');
    chk('R7b بی‌Redis هم ابطالِ محلی همان لحظه اثر می‌کند', (await D.isRevokedAsync('jt_fresh')) === true);

    /* R17 — گزینهٔ سخت‌گیرانه: اگر deployer بخواهد، قطعِ Redis هم ۴۰۱ است */
    const wasReq = process.env.PAYESH_REVOKE_REQUIRE_REDIS;
    const wasUrl = process.env.REDIS_URL;
    process.env.PAYESH_REVOKE_REQUIRE_REDIS = '1';
    process.env.REDIS_URL = 'redis://example:6379';
    const strict = await D.isRevokedAsync('jt_alive_' + Date.now());
    process.env.PAYESH_REVOKE_REQUIRE_REDIS = (wasReq === undefined ? '' : wasReq);
    if(wasUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = wasUrl;
    chk('R17 با PAYESH_REVOKE_REQUIRE_REDIS=1 قطعِ Redis هم رد می‌شود (انتخابِ deployer)',
        strict === true, String(strict));
  }

  /* ── R4/R5: توزیع‌شدگی با خودِ server/redis.js (حالتِ بازگشتِ حافظه) ──
     publish در redis.js به همهٔ مشترکانِ همان پروسه می‌رسد ⇒ دو «نمونه»
     واقعی را می‌توان در یک پروسه شبیه‌سازی کرد. */
  console.log('\n— بخشِ ۲: توزیع‌شدگی (دو نمونه، از راهِ redis.js) —');
  {
    const realRedis = require(path.join(ROOT, 'server', 'redis.js'));
    const storeA = { __revoked_jti: {} };
    const storeB = { __revoked_jti: {} };
    const storeC = { __revoked_jti: {} };
    const A = createRevocation({ store: storeA, redis: realRedis, ttlS: 28800, channel: 'payesh:pubsub:revoke:test1' });
    const B = createRevocation({ store: storeB, redis: realRedis, ttlS: 28800, channel: 'payesh:pubsub:revoke:test1' });
    await A.init(); await B.init();
    /* C اصلاً اشتراک نمی‌گیرد ⇒ فقط از L2 می‌تواند بفهمد */
    const C = createRevocation({ store: storeC, redis: realRedis, ttlS: 28800, channel: 'payesh:pubsub:revoke:test1' });

    const jti = 'jt_dist_' + Date.now();
    await A.revokeSession(jti, 'logout');
    await sleep(120); /* پخشِ پیام */
    chk('R4 نمونه‌ی دوم از راهِ Pub/Sub همان لحظه مطلع می‌شود',
        B.isRevoked(jti) === true && (await B.isRevokedAsync(jti)) === true);
    chk('R5 نمونه‌ی بی‌اشتراک از راهِ L2 (Redis) می‌فهمد — پشتبانِ پیامِ گم‌شده',
        (await C.isRevokedAsync(jti)) === true);
    chk('R5b آمار: پخش انجام شده و دست‌کم یک پیام دریافت شده',
        A.snapshot().stats.published >= 1 && B.snapshot().stats.received >= 1,
        JSON.stringify({ a: A.snapshot().stats, b: B.snapshot().stats }));
  }

  /* ── R16: کِشِ پاسخِ منفی نباید ابطال را پنهان کند ────────────────
     نمونه‌ای که پاسخِ منفی را کِش کرده و **اشتراکی هم ندارد** (پیام را
     نمی‌گیرد)، باید پس از گذشتنِ عمرِ کِش، از لایه‌ی دوم بفهمد. اگر کِش
     بی‌انتها شود، این ابطال تا ابد پنهان می‌ماند. */
  {
    const rd2 = fakeRedis({ active: true });
    const sA = { __revoked_jti: {} }, sB = { __revoked_jti: {} };
    const A2 = createRevocation({ store: sA, redis: rd2, ttlS: 28800, channel: 'payesh:pubsub:revoke:neg' });
    await A2.init();
    const B2 = createRevocation({ store: sB, redis: rd2, ttlS: 28800, channel: 'payesh:pubsub:revoke:neg' });
    const j = 'jt_neg_' + Date.now();
    const first = await B2.isRevokedAsync(j);         /* منفی ⇒ در کِش می‌نشیند */
    await A2.revokeSession(j, 'test');                /* حالا ابطال می‌شود */
    const during = await B2.isRevokedAsync(j);        /* هنوز در پنجره‌ی کِش: منفی */
    await sleep(150);                                  /* عمرِ کِش می‌گذرد */
    const after = await B2.isRevokedAsync(j);
    chk('R16 کِشِ پاسخِ منفی، ابطال را برای همیشه پنهان نمی‌کند',
        first === false && after === true, JSON.stringify({ first: first, during: during, after: after }));
    chk('R16b در خودِ پنجره‌ی کِش پاسخ همان منفیِ کِش‌شده است (کِش واقعاً کار می‌کند)',
        during === false, String(during));
  }

  /* ── بخشِ ۳: HTTP واقعی ─────────────────────────────────────────── */
  console.log('\n— بخشِ ۳: HTTP واقعی (خروج / حذفِ حساب / راه‌هایِ نجات) —');
  const { server, store, revocation } = require(path.join(ROOT, 'server', 'index.js'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  async function req(method, p, { body, cookie } = {}){
    const res = await fetch(BASE + p, {
      method,
      headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch(e){}
    return { status: res.status, json, headers: res.headers };
  }
  const cookieOf = (r) => {
    const sc = r.headers.get('set-cookie') || '';
    const m = sc.match(/payesh_session=[^;]+/);
    return m ? m[0] : null;
  };
  async function loginAs(user){
    const phone = String(user.phone).replace(/[\s\-()]/g, '');
    const s = await req('POST', '/api/auth/send-code', { body: { phone } });
    const code = (s.json && s.json.demo_code) ? s.json.demo_code : null;
    if(!code) throw new Error('کدِ نمایشی نیامد — PAYESH_DEMO_CODE=1 لازم است');
    const r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: user.national_id } });
    return { res: r, cookie: cookieOf(r) };
  }

  /* یک کاربرِ تازه برای این سنجه (دست‌نزدن به دادهٔ بقیهٔ تست‌ها) */
  const probePhone = '0999000' + String(1000 + Math.floor(Math.random() * 8999));
  const nid = '00' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const school = (store.schools || []).filter(s => s.active)[0];
  const mk = (role) => (store.users.find(u => u.role === role && u.active) || store.users[0]);
  const proto = mk('manager');
  const probe = require(path.join(ROOT, 'server', 'index.js')) && (function(){
    /* ساختِ کاربرِ آزمونیِ مستقیم در store (همان شیوه‌ی seed) */
    const id = Math.max.apply(null, store.users.map(u => u.id || 0)) + 1;
    const u = { id: id, school_id: school.id, role: 'teacher', full_name: 'کاربرِ آزمونِ ابطال',
                username: 'rev' + id, password: 'x', national_id: nid, phone: probePhone, active: 1 };
    store.users.push(u);
    return u;
  })();

  const L1 = await loginAs(probe);
  chk('R2a ورودِ کاربرِ آزمونی موفق بود', L1.res.status === 200 && !!L1.cookie, L1.res.status);
  let me = await req('GET', '/api/auth/me', { cookie: L1.cookie });
  chk('R2 پیش از خروج، /api/auth/me پاسخ می‌دهد (۲۰۰)', me.status === 200, me.status);

  /* یک نشستِ دوم (دستگاهِ دیگر) */
  const L2 = await loginAs(probe);
  chk('R2b نشستِ دوم (دستگاهِ دیگر) ساخته شد', L2.res.status === 200 && !!L2.cookie && L2.cookie !== L1.cookie, L2.res.status);

  const lo = await req('POST', '/api/auth/logout', { cookie: L1.cookie });
  chk('R2c خروج موفق (۲۰۰)', lo.status === 200, lo.status);
  me = await req('GET', '/api/auth/me', { cookie: L1.cookie });
  chk('R1 پس از خروج، همان توکن دیگر کار نمی‌کند (۴۰۱)', me.status === 401, me.status);
  chk('R1b نشستِ مرده به لایه‌ی داده نمی‌رسد (۴۰۱، بی‌هیچ داده‌ای)',
      me.status === 401 && me.json && me.json.ok === false, JSON.stringify(me.json));

  /* کدِ «revoked» مخصوصِ حالتی است که L1 نمی‌داند اما L2 می‌داند (نمونه‌ای
     که پیام را گرفته یا کسی که L1 را پاک کرده). اینجا همان را می‌سنجیم:
     ابطال را از L1 پاک می‌کنیم تا فقط دروازه (با تکیه بر L2) جواب دهد. */
  const jtiOfCookie = (ck) => {
    const tok = String(ck).replace('payesh_session=', '');
    try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8')).jti; }
    catch(e){ return null; }
  };
  const deadJti = jtiOfCookie(L1.cookie);
  const hadLocal = !!store.__revoked_jti[deadJti];
  delete store.__revoked_jti[deadJti];   /* L1 را فراموش می‌کنیم */
  me = await req('GET', '/api/auth/me', { cookie: L1.cookie });
  chk('R1c دروازه با تکیه بر لایه‌ی دوم هم جلوی نشستِ مرده را می‌گیرد',
      hadLocal && me.status === 401, JSON.stringify({ hadLocal: hadLocal, status: me.status }));
  chk('R1d در این حالت کدِ خطا دقیقاً «revoked» است', (me.json && me.json.code) === 'revoked', JSON.stringify(me.json));
  store.__revoked_jti[deadJti] = Date.now(); /* بازگردانی به حالتِ ابطال‌شده */

  /* R12: مسیرهایِ نجات با کلوچه‌ی مرده هم بازند */
  const sc = await req('POST', '/api/auth/send-code', { body: { phone: probePhone } });
  chk('R12 ارسالِ کد با کلوچه‌یِ باطل‌شده هم کار می‌کند (قفلِ ابدی ممنوع)', sc.status === 200, sc.status);
  const relog = await loginAs(probe);
  chk('R12b ورودِ دوباره با کلوچه‌یِ باطل‌شده ممکن است', relog.res.status === 200, relog.res.status);

  /* R13/R14: حذفِ حساب ⇒ همه‌ی نشست‌ها، نه فقط یکی */
  const before = fs.existsSync(T_AUDIT) ? fs.readFileSync(T_AUDIT, 'utf8') : '';
  const del = await req('POST', '/api/auth/delete-account', { cookie: relog.cookie });
  chk('R13 حذفِ حساب موفق (۲۰۰)', del.status === 200, del.status);
  me = await req('GET', '/api/auth/me', { cookie: relog.cookie });
  chk('R13b نشستِ دستگاهِ دیگر هم پس از حذفِ حساب مرد (۴۰۱)', me.status === 401, me.status);
  me = await req('GET', '/api/auth/me', { cookie: L2.cookie });
  chk('R13c نشستِ قدیمی‌ترِ همان کاربر هم مرد (۴۰۱)', me.status === 401, me.status);

  const after = fs.existsSync(T_AUDIT) ? fs.readFileSync(T_AUDIT, 'utf8') : '';
  chk('R14 رویدادِ آدیتِ «sessions_revoked» ثبت شد',
      after.indexOf('sessions_revoked') > -1 && after.length > before.length);
  chk('R14b آدیتِ ابطال، شمارهٔ تلفن/کدملی ندارد (قفلِ حریم‌خصوصی)',
      after.indexOf('sessions_revoked') === -1 || (after.indexOf(nid) === -1 && after.indexOf(probePhone) === -1));

  /* سلامتِ ماژول در پایان */
  const snap = revocation.snapshot();
  chk('R15 وضعیتِ ماژول سالم است (ابطال‌هایِ انجام‌شده > ۰)', snap.stats.revoked >= 2, JSON.stringify(snap.stats));

  server.close();

  console.log('\n────────────────────────────────────────────────────');
  console.log(`ابطالِ نشست: ${pass} بررسی — ${fail === 0 ? 'همه سبز ✅' : '❌ ' + fail + ' قرمز'}`);
  if(fail) { console.log('مواردِ قرمز:'); errors.forEach(e => console.log('  • ' + e)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('خطایِ اجرا:', e); process.exit(1); });
