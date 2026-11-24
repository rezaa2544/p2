#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   sentinel-nat.test.js — announce-ip hardening (announce-ip در برابرِ
   failover به گره‌ای بدونِ پورتِ هاست)
   ───────────────────────────────────────────────────────────────────
   زمینهٔ واقعی (2026-11-24، تکرارپذیر): پس از یک failover واقعیِ
   Sentinel، مستری به یکی از replicaها نقل کرد که هیچ پورت منتشرشدهٔ
   هاست نداشت؛ هر کلاینتِ سمتِ هاست مرد در حالی که sentinelها هنوز
   آدرسِ داخلیِ 172.18.x.x را گزارش می‌کردند. سخت‌سازی:
   REDIS_SENTINEL_NAT_MAP='داخلی=هاست‌دست‌پذیر,...' — سرور خودش مستر را
   از sentinelها می‌پرسد، آدرس را از نقشهٔ NAT ترجمه و standalone وصل
   می‌شود (mode='sentinel-nat').

   این سویت کاملاً آفلاین است: sentinel واقعی نمی‌خواهد — یک sentinel
   جعلیِ RESP minimal روی پورت تصادفی بالا می‌آید.
   خروجی‌ها: 0 = سبز · 1 = شکست (skip/NOT-RUN ممنوع).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const net = require('net');
const path = require('path');
const redis = require(path.join(__dirname, '..', 'server', 'redis.js'));

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}

/* ── فیکِ sentinel: RESP مینیمال — AUTH→+OK، SENTINEL get-master-addr→آرایه ── */
function fakeSentinel(masterHost, masterPort, opts) {
  opts = opts || {};
  const server = net.createServer((sock) => {
    sock.on('data', (buf) => {
      const txt = buf.toString();
      if (/^AUTH/i.test(txt)) { sock.write('+OK\r\n'); return; }
      if (/get-master-addr-by-name/i.test(txt)) {
        if (opts.replyDead) { sock.write('*-1\r\n'); return; } /* nil array */
        if (opts.replyBadShape) { sock.write('*1\r\n$4\r\n junk\r\n'); return; }
        sock.write('*2\r\n$' + Buffer.byteLength(masterHost) + '\r\n' + masterHost + '\r\n$' + String(masterPort).length + '\r\n' + masterPort + '\r\n');
        return;
      }
      sock.write('-ERR unknown command\r\n');
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

(async function main() {
  console.log('sentinel-nat.test — announce-ip hardening (offline)\n');

  /* ── ۱. parseNatMap — پارسِ خالص ── */
  const good = redis.parseNatMap('172.18.0.2:6379=127.0.0.1:16379, 172.18.0.3:6379=127.0.0.1:16380');
  chk('NAT1 نقشهٔ معتبر دو-جمله‌ای پارس می‌شود',
    good && good['172.18.0.2:6379'].host === '127.0.0.1' && good['172.18.0.2:6379'].port === 16379
    && good['172.18.0.3:6379'].port === 16380, JSON.stringify(good));
  chk('NAT2 ورودی خالی ⇒ null (پیش‌فرض = مسیر sentinel معمول)',
    redis.parseNatMap('') === null && redis.parseNatMap('   ') === null && redis.parseNatMap(undefined) === null);
  chk('NAT3 جملهٔ بدون «=» ⇒ کل نقشه رد می‌شود (fail-closed)', redis.parseNatMap('172.18.0.2:6379') === null);
  chk('NAT4 پورتِ بیرون از بازه ⇒ null', redis.parseNatMap('172.18.0.2:6379=127.0.0.1:99999') === null);
  chk('NAT5 پورتِ نامعتبر ⇒ null', redis.parseNatMap('172.18.0.2:6379=127.0.0.1:abc') === null);
  chk('NAT6 مقصدِ بدونِ پورت ⇒ null', redis.parseNatMap('172.18.0.2:6379=127.0.0.1') === null);

  /* ── ۲. buildRedisConfig — سیم‌کشیِ natMap در شاخهٔ sentinel ── */
  const SENT = '127.0.0.1:26379,127.0.0.1:26380,127.0.0.1:26381';
  const cfgWith = redis.buildRedisConfig({ REDIS_SENTINELS: SENT, REDIS_SENTINEL_NAT_MAP: '172.18.0.2:6379=127.0.0.1:16379' });
  chk('NAT7 cfg با نقشهٔ معتبر: mode=sentinel و natMap سیم شده',
    cfgWith.mode === 'sentinel' && cfgWith.natMap && cfgWith.natMap['172.18.0.2:6379'].port === 16379,
    JSON.stringify(cfgWith.natMap));
  const cfgBad = redis.buildRedisConfig({ REDIS_SENTINELS: SENT, REDIS_SENTINEL_NAT_MAP: 'broken-entry' });
  chk('NAT8 نقشهٔ خراب ⇒ natMap=null (مسیر پیش‌فرض حفظ می‌شود)',
    cfgBad.mode === 'sentinel' && cfgBad.natMap === null);
  const cfgNone = redis.buildRedisConfig({ REDIS_SENTINELS: SENT });
  chk('NAT9 بدون env ⇒ natMap خالی — رفتار پیشین دست‌نخورده', cfgNone.mode === 'sentinel' && !cfgNone.natMap);
  const cfgStandalone = redis.buildRedisConfig({ REDIS_URL: 'redis://127.0.0.1:6379', REDIS_SENTINEL_NAT_MAP: '172.18.0.2:6379=127.0.0.1:16379' });
  chk('NAT10 standalone از NAT اثری نمی‌برد', cfgStandalone.mode === 'standalone' && !cfgStandalone.natMap);

  /* ── ۳. resolveMasterFromSentinels — sentinel جعلیِ واقعی-TCP ── */
  const s1 = await fakeSentinel('172.18.0.2', 6379);
  const s2 = await fakeSentinel('172.18.0.9', 9999, { replyDead: true }); /* پاسخِ nil */
  const resolved = await redis.resolveMasterFromSentinels(
    [{ host: '127.0.0.1', port: s2.port }, { host: '127.0.0.1', port: s1.port }],
    'mymaster', 'test-pass');
  chk('NAT11 sentinel دوم (پاسخِ معتبر) برنده می‌شود',
    resolved && resolved.host === '172.18.0.2' && resolved.port === 6379, JSON.stringify(resolved));

  const sBad = await fakeSentinel('x', 1, { replyBadShape: true });
  const resolvedBad = await redis.resolveMasterFromSentinels([{ host: '127.0.0.1', port: sBad.port }], 'mymaster', null);
  chk('NAT12 پاسخِ بدشکل ⇒ null (fail-closed، هیچ حدس ممنوع)', resolvedBad === null, JSON.stringify(resolvedBad));

  const deadPort = await new Promise((res) => { const srv = net.createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => res(p)); }); });
  const resolvedDead = await redis.resolveMasterFromSentinels(
    [{ host: '127.0.0.1', port: deadPort }, { host: '127.0.0.1', port: s1.port }], 'mymaster', 'test-pass');
  chk('NAT13 sentinel مرده دور می‌خورد و sentinel زنده جواب می‌دهد',
    resolvedDead && resolvedDead.host === '172.18.0.2' && resolvedDead.port === 6379, JSON.stringify(resolvedDead));

  const resolvedAll = await redis.resolveMasterFromSentinels(
    [{ host: '127.0.0.1', port: deadPort }], 'mymaster', 'test-pass');
  chk('NAT14 همهٔ sentinelها مرده ⇒ null', resolvedAll === null);

  /* ترجمهٔ end-to-end: آدرسِ گزارش‌شده × نقشه ⇒ آدرسِ هاست */
  const reported = resolved; /* 172.18.0.2:6379 */
  const mapped = good[String(reported.host) + ':' + reported.port];
  chk('NAT15 ترجمهٔ آدرسِ گزارش‌شده از طریق نقشه ⇒ 127.0.0.1:16379',
    mapped && mapped.host === '127.0.0.1' && mapped.port === 16379, JSON.stringify(mapped));

  s1.server.close(); s2.server.close(); sBad.server.close();

  console.log('\nنتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
  if (fail) {
    console.log('شکست‌ها:');
    for (const f of fails) console.log(' - ' + f);
    /* خروج طبیعی با کد شکست — فراخوانیِ دائمِ exit ممنوع (کلاس G7) و
       event loop را هم نمی‌بندد؛ سرورهای فیک این بالا بسته شده‌اند. */
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
})();
