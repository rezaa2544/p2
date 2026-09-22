#!/usr/bin/env node
/* رگرسیون BUG-2 (باگ‌هانت چت ۵): fail-closedِ زمانِ اجرا در تولید.
   ─────────────────────────────────────────────────────────────
   P0-13 فقط بوت را نگهبانی می‌کرد؛ اگر ردیس وسطِ کار خطا می‌داد (یا
   رویدادِ error پرچمِ اتصال را می‌انداخت)، همهٔ عملیات‌ها بی‌صدا به
   حافظهٔ محلی می‌افتادند و state حیاتی (ریت‌لیمیت، idempotency، OTP،
   قفل‌ها، کش) بین نمونه‌ها واگرا می‌شد. در تولید حالا باید خطا بالا
   برود (→ ۵۰۰ + readiness ـ ۵۰۳)؛ توسعه بی‌تغییر می‌ماند.
   بدونِ ردیسِ واقعی: درایورِ جعلیِ ioredis از طریق Module._load تزریق
   می‌شود (قطعی، بدونِ TCP/پورت — امن برایِ اجرای موازی). */
'use strict';

const ROLE = process.env.PRODFAIL_ROLE || '';

if (ROLE === '') {
  /* ── رانر: سه فرزند با env جدا (IS_PRODUCTION در لود خوانده می‌شود) ── */
  const { execFileSync } = require('child_process');
  let pass = 0, fail = 0;
  for (const r of ['a', 'b', 'c']) {
    try {
      const out = execFileSync(process.execPath, [__filename], {
        env: Object.assign({}, process.env,
          r === 'b' ? { PRODFAIL_ROLE: 'b', NODE_ENV: 'development' }
                    : { PRODFAIL_ROLE: r, NODE_ENV: 'production' }),
        timeout: 60000, stdio: 'pipe',
      }).toString();
      const m = out.match(/PRODFAIL (\d+)\/(\d+)/);
      if (m && m[1] === m[2]) { pass++; console.log(`  ✅ نقش ${r}: ${m[1]}/${m[2]}`); }
      else { fail++; console.log(`  ❌ نقش ${r}:\n${out}`); }
    } catch (e) {
      fail++;
      console.log(`  ❌ نقش ${r} کرش/قرمز:\n` + String((e.stdout || '') + (e.stderr || '')).slice(0, 2000));
    }
  }
  console.log(`\nredis-prodfail: ${pass}/3 نقش سبز`);
  process.exit(fail ? 1 : 0);
}

/* ── فرزند ── */
const Module = require('module');
const { EventEmitter } = require('events');

let ok = 0, bad = 0;
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { bad++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
async function mustThrow(name, fn) {
  try { const v = await fn(); chk(name, false, 'پرتاب نکرد، برگرداند: ' + JSON.stringify(v)); }
  catch (e) { chk(name, true); }
}

async function roleA() {
  /* تولید بدونِ init (ردیس غایب): همهٔ عملیاتِ state باید بپراند. */
  const redis = require('../server/redis.js');
  chk('A0 isRedis نادرست است', redis.isRedis() === false);
  await mustThrow('A1 get می‌پراند', () => redis.get('k'));
  await mustThrow('A2 set می‌پراند', () => redis.set('k', 'v'));
  await mustThrow('A3 del می‌پراند', () => redis.del('k'));
  await mustThrow('A4 incr می‌پراند', () => redis.incr('c'));
  await mustThrow('A5 incrWithTtl می‌پراند', () => redis.incrWithTtl('c', 60));
  await mustThrow('A6 expire می‌پراند', () => redis.expire('k', 60));
  await mustThrow('A7 ttl می‌پراند', () => redis.ttl('k'));
  await mustThrow('A8 scan می‌پراند', () => redis.scan('payesh:*'));
  await mustThrow('A9 setNX می‌پراند', () => redis.setNX('l', 't', 5));
  await mustThrow('A10 compareAndDelete می‌پراند', () => redis.compareAndDelete('l', 't'));
  await mustThrow('A11 publish می‌پراند', () => redis.publish('ch', 'm'));
  await mustThrow('A12 subscribe می‌پراند', () => redis.subscribe('ch', () => {}));
  /* مشاهده/بستن باید جواب بدهند (نه پرتاب).
     RR-07 (Arena-2 runtime audit): در تولید ping هرگز نباید «سبزِ حافظه‌ای»
     گزارش کند — شکلِ درستِ قطعی `{ok:false, driver:'none', error:'REDIS_UNAVAILABLE'}`
     است (a3c213e0). انتظارِ قدیمیِ `driver==='memory'` باگِ خودِ تست بود و
     پس از آن فیکس، نقشِ a را قرمز می‌کرد (15/16 در 172da62b). */
  const p = await redis.ping();
  chk('A13 ping جواب می‌دهد و هرگز حافظهٔ سالمِ جعلی گزارش نمی‌کند',
      !!p && p.ok === false && p.driver !== 'memory');
  chk('A14 ready نادرست است', redis.ready() === false);
  await redis.close();
  chk('A15 close بی‌خطا', true);
}

async function roleB() {
  /* توسعه: رفتارِ حافظه دقیقاً مثلِ قبل. */
  const redis = require('../server/redis.js');
  chk('B1 get تهی', (await redis.get('k')) === null);
  chk('B2 set OK', (await redis.set('k', 'v', 'EX', 60)) === 'OK');
  chk('B3 get مقدار', (await redis.get('k')) === 'v');
  chk('B4 incr از ۱', (await redis.incr('c')) === 1);
  chk('B5 incrWithTtl', (await redis.incrWithTtl('c2', 60)) === 1);
  chk('B6 expire', (await redis.expire('k', 60)) === 1);
  const t = await redis.ttl('k');
  chk('B7 ttl مثبت', t > 0 && t <= 60, 'ttl=' + t);
  chk('B8 setNX نخست true', (await redis.setNX('l', 't1', 5)) === true);
  chk('B9 setNX دوم false', (await redis.setNX('l', 't2', 5)) === false);
  chk('B10 CAS درست true', (await redis.compareAndDelete('l', 't1')) === true);
  const keys = await redis.scan('payesh:*');
  chk('B11 scan آرایه', Array.isArray(keys));
  let got = null;
  await redis.subscribe('ch', (m) => { got = m; });
  await redis.publish('ch', 'hello');
  chk('B12 pub/sub محلی', got === 'hello');
  await redis.close();
  chk('B13 close بی‌خطا', true);
}

async function roleC() {
  /* تولید + ردیسِ جعلی: خطایِ فرمان → پرتاب؛ error → گارد؛ connect → بهبود. */
  class FakeRedis extends EventEmitter {
    constructor() { super(); FakeRedis.instances.push(this); this.mode = 'reject'; }
    async connect() {}
    disconnect() {}
    async get() { return this._r('v'); }
    async set() { return this._r('OK'); }
    async del() { return this._r(1); }
    async incr() { return this._r(7); }
    async expire() { return this._r(1); }
    async ttl() { return this._r(42); }
    async eval() { return this._r(3); }
    async publish() { return this._r(1); }
    async scan() { return this._r(['0', []]); }
    async ping() { return this._r('PONG'); }
    async subscribe() { if (this.mode === 'reject') throw new Error('boom-sub'); }
    _r(v) { if (this.mode === 'reject') throw new Error('boom-cmd'); return v; }
  }
  FakeRedis.instances = [];
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'ioredis') return FakeRedis;
    return origLoad.apply(this, arguments);
  };
  process.env.REDIS_URL = 'redis://fake:6379';
  const redis = require('../server/redis.js');
  const r = await redis.init();
  chk('C0 init با درایورِ جعلی ok', r && r.ok === true && r.driver === 'redis', JSON.stringify(r));
  chk('C1 isRedis درست', redis.isRedis() === true);
  await mustThrow('C2 get روی خطای فرمان می‌پراند', () => redis.get('k'));
  await mustThrow('C3 set روی خطای فرمان می‌پراند', () => redis.set('k', 'v'));
  await mustThrow('C4 del روی خطای فرمان می‌پراند', () => redis.del('k'));
  await mustThrow('C5 incr روی خطای فرمان می‌پراند', () => redis.incr('c'));
  await mustThrow('C6 incrWithTtl روی خطای فرمان می‌پراند', () => redis.incrWithTtl('c', 60));
  await mustThrow('C7 expire روی خطای فرمان می‌پراند', () => redis.expire('k', 60));
  await mustThrow('C8 ttl روی خطای فرمان می‌پراند', () => redis.ttl('k'));
  await mustThrow('C9 scan روی خطای فرمان می‌پراند', () => redis.scan());
  await mustThrow('C10 publish روی خطای فرمان می‌پراند', () => redis.publish('ch', 'm'));
  await mustThrow('C11 subscribe روی خطای فرمان می‌پراند', () => redis.subscribe('ch2', () => {}));
  chk('C12 setNX روی خطا false می‌ماند (fail-closed قبلی)', (await redis.setNX('l', 't', 5)) === false);
  chk('C13 CAS روی خطا false می‌ماند', (await redis.compareAndDelete('l', 't')) === false);
  /* رویدادِ error → پرچم می‌افتد → گارد. */
  const main = FakeRedis.instances[0];
  main.emit('error', new Error('conn lost'));
  await new Promise((res) => setImmediate(res));
  chk('C14 پس از error پرچم افتاده', redis.isRedis() === false);
  await mustThrow('C15 get پس از قطع می‌پراند (گارد)', () => redis.get('k'));
  await mustThrow('C16 incr پس از قطع می‌پراند (گارد)', () => redis.incr('c'));
  chk('C17 ready پس از قطع نادرست', redis.ready() === false);
  /* بهبود: connect + فرمانِ سالم. */
  main.mode = 'resolve';
  main.emit('connect');
  await new Promise((res) => setImmediate(res));
  chk('C18 پس از connect پرچم برگشته', redis.isRedis() === true);
  chk('C19 get پس از بهبود مقدار می‌دهد', (await redis.get('k')) === 'v');
  await redis.close();
  chk('C20 close بی‌خطا', true);
}

(async () => {
  try {
    if (ROLE === 'a') await roleA();
    else if (ROLE === 'b') await roleB();
    else if (ROLE === 'c') await roleC();
    else { console.log('نقش ناشناخته'); process.exit(2); }
  } catch (e) {
    bad++;
    console.log('  ❌ کرش: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  }
  console.log(`PRODFAIL ${ok}/${ok + bad}`);
  process.exit(bad ? 1 : 0);
})();
