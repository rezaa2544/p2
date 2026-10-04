#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   m14-c01-retry-exhaustion.js — regression: Redis Cluster/Sentinel
   ───────────────────────────────────────────────────────────────────
   نقصِ M14-C01 (P1): `clusterRetryStrategy` و `sentinelRetryStrategy`
   در server/redis.js پس از چند تلاش `null` برمی‌گرداندند. در ioredis
   برگرداندنِ non-number یعنی «تسلیمِ دائمی»: setStatus('end') +
   flushQueue و دیگر هیچ بازتصلی‌ای اتفاق نمی‌افتد. نتیجهٔ عملی:
     - cluster: هر قطعیِ بیشتر از ~۱.۸s (۴ تلاش) ⇒ کلاینت برای همیشه
       می‌میرد؛ فقط restartِ فرایند بازیابی می‌کرد.
     - sentinel: هر قطعیِ بیشتر از ~۵.۲۵s (۶ تلاش) ⇒ همان. ولی خودِ
       failoverِ sentinel تا ۱۵s طول می‌کشد (HA_REDIS.md §۱) — پس در هر
       failoverِ واقعی کلاینت می‌مرد.
   standalone قبلاً remediation شده بود (هرگز null نمی‌دهد)؛ این تست
   همان قرارداد را برایِ cluster و sentinel هم تضمین می‌کند.

   سه لایه:
     آ) قرارداد (دترمینیستیک، بدون شبکه): strategy هرگز null/non-number
        نیست و backoff سقف‌دار می‌ماند.
     ب) رفتار (blackhole واقعی + ioredis واقعی + پیکربندیِ واقعی):
        کلاینتِ ساخته‌شده از buildRedisConfig نباید به 'end' برسد.
     ج) negative proof (C01_MUTATE=VULN): با بازگرداندنِ strategyِ
        قدیمی، همان کلاینت باید به 'end' برسد — یعنی تست load-bearing است.

   اجرا:
     node tests/m14-c01-retry-exhaustion.js          # باید EXIT=0
     C01_MUTATE=VULN node tests/m14-c01-retry-exhaustion.js   # باید EXIT=0
        (اثبات می‌کند که با reverted-fix تست قرمز می‌شود)
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const net = require('net');
const path = require('path');
const Redis = require('ioredis');
const { buildRedisConfig } = require(path.join(__dirname, '..', 'server', 'redis.js'));

const VULN = process.env.C01_MUTATE === 'VULN';

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}

/* strategyِ قدیمیِ آسیب‌پذیر — معادلِ کدِ قبل از fix */
function vulnerableClusterStrategy(times) { return times > 3 ? null : Math.min(times * 300, 2000); }
function vulnerableSentinelStrategy(times) { return times > 5 ? null : Math.min(times * 250, 1500); }

/* از خودِ buildRedisConfig می‌گیریم تا strategyِ واقعیِ production زیر
   آزمون باشد؛ در حالتِ VULN، آن را با نسخهٔ قدیمی جایگزین می‌کنیم. */
function getClusterStrategy() {
  const cfg = buildRedisConfig({
    REDIS_CLUSTER_NODES: '127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002'
  });
  const real = cfg.clusterOptions.clusterRetryStrategy;
  return VULN ? vulnerableClusterStrategy : real;
}
function getSentinelStrategy() {
  const cfg = buildRedisConfig({
    REDIS_SENTINELS: '127.0.0.1:26379,127.0.0.1:26380,127.0.0.1:26381',
    REDIS_SENTINEL_NAME: 'mymaster'
  });
  const real = cfg.sentinelOptions.retryStrategy;
  return VULN ? vulnerableSentinelStrategy : real;
}

/* blackhole: TCP accept می‌کند ولی هرگز چیزی نمی‌فرستد — همان
   پارتیشنِ «اتصالِ زنده ولی بی‌پاسخ» (درسِ A-22). */
function startBlackhole() {
  return new Promise((res, rej) => {
    const srv = net.createServer((sock) => { sock.on('error', () => {}); sock.on('data', () => {}); });
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  console.log('\n▸ M14-C01 — Redis Cluster/Sentinel retry exhaustion' + (VULN ? ' [حالتِ VULN: negative proof]' : ''));
  const label = VULN ? 'آسیب‌پذیر' : 'اصلاح‌شده';

  /* ── لایهٔ آ: قراردادِ دترمینیستیک ── */
  console.log('— لایهٔ آ: قراردادِ strategy —');

  const cs = getClusterStrategy();
  let csBad = null;
  for (let t = 1; t <= 1000 && !csBad; t++) {
    const v = cs(t);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) csBad = { t, v };
  }
  if (VULN) {
    chk('آ-۱ (VULN) cluster در times>3 تسلیم می‌شود', csBad !== null && csBad.t === 4, JSON.stringify(csBad));
  } else {
    chk('آ-۱ cluster retryStrategy هرگز null/non-number نمی‌دهد (۱۰۰۰ تلاش)', csBad === null, JSON.stringify(csBad));
    chk('آ-۲ cluster backoff سقف‌دار (≤۲۰۰۰ms)', cs(1000) === 2000, 'cs(1000)=' + cs(1000));
    chk('آ-۳ cluster در تلاشِ اول تأخیر مثبت دارد', cs(1) > 0, 'cs(1)=' + cs(1));
  }

  const ss = getSentinelStrategy();
  let ssBad = null;
  for (let t = 1; t <= 1000 && !ssBad; t++) {
    const v = ss(t);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) ssBad = { t, v };
  }
  if (VULN) {
    chk('آ-۲ (VULN) sentinel در times>5 تسلیم می‌شود', ssBad !== null && ssBad.t === 6, JSON.stringify(ssBad));
  } else {
    chk('آ-۴ sentinel retryStrategy هرگز null/non-number نمی‌دهد (۱۰۰۰ تلاش)', ssBad === null, JSON.stringify(ssBad));
    chk('آ-۵ sentinel backoff سقف‌دار (≤۱۵۰۰ms)', ss(1000) === 1500, 'ss(1000)=' + ss(1000));
  }

  /* standalone نباید تغییر کند — اثباتِ backward-compat */
  const standalone = buildRedisConfig({ REDIS_URL: 'redis://127.0.0.1:6379' });
  const standaloneStrategy = standalone.options.retryStrategy;
  let stBad = null;
  for (let t = 1; t <= 1000 && !stBad; t++) {
    const v = standaloneStrategy(t);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) stBad = { t, v };
  }
  chk('آ-۶ standalone retryStrategy همچنان هرگز تسلیم نمی‌شود (بدونِ تغییر)', stBad === null, JSON.stringify(stBad));

  /* ── لایهٔ ب/ج: رفتار با blackhole واقعی ── */
  console.log('— لایهٔ ' + (VULN ? 'ج' : 'ب') + ': blackhole با ioredis واقعی —');

  /* cluster: پیکربندیِ واقعیِ production، فقط نودها به blackhole اشاره می‌کنند */
  const bh = await startBlackhole();
  const bhPort = bh.address().port;
  const clusterCfg = buildRedisConfig({ REDIS_CLUSTER_NODES: '127.0.0.1:' + bhPort });
  const clusterClient = new Redis.Cluster(
    [{ host: '127.0.0.1', port: bhPort }],
    Object.assign({}, clusterCfg.clusterOptions, {
      lazyConnect: true,
      clusterRetryStrategy: VULN ? vulnerableClusterStrategy : clusterCfg.clusterOptions.clusterRetryStrategy
    })
  );
  clusterClient.on('error', () => {});
  try { await clusterClient.connect(); } catch (e) { /* انتظار: در پارتیشن fail می‌شود */ }
  await sleep(9000); /* > پنجرهٔ تسلیمِ قدیم (~۱.۸s) + حاشیه */
  const clusterStatus = clusterClient.status;
  try { clusterClient.disconnect(); } catch (e) {}
  if (VULN) {
    chk('ب/ج-۱ (VULN) cluster به \'end\' دائمی می‌رسد', clusterStatus === 'end', 'status=' + clusterStatus);
  } else {
    chk('ب/ج-۱ cluster همچنان در حالِ بازتصل است (نه \'end\')', clusterStatus !== 'end', 'status=' + clusterStatus);
  }

  /* sentinel: blackhole را می‌بندیم تا همان پورت «refused» شود —
     SentinelConnector فقط با refused واردِ حلقهٔ sentinelRetryStrategy
     می‌شود؛ با blackhole، connect() بدونِ پاسخ می‌مانَد (درسِ مهم: این
     یعنی commandTimeout روی مسیرِ discoveryِ sentinel اعمال نمی‌شود). */
  await new Promise((r) => { try { bh.close(() => r()); } catch (e) { r(); } });
  const deadPort = bhPort;
  const sentinelCfg = buildRedisConfig({ REDIS_SENTINELS: '127.0.0.1:' + deadPort, REDIS_SENTINEL_NAME: 'mymaster' });
  const sentinelClient = new Redis(Object.assign({}, sentinelCfg.options, {
    sentinels: sentinelCfg.sentinels,
    name: sentinelCfg.name,
    lazyConnect: true,
    sentinelRetryStrategy: VULN ? vulnerableSentinelStrategy : sentinelCfg.sentinelOptions.retryStrategy
  }));
  sentinelClient.on('error', () => {});
  let sentinelConnectRejected = false;
  try {
    await Promise.race([
      sentinelClient.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('deadline')), 8000))
    ]);
  } catch (e) { sentinelConnectRejected = true; }
  chk('ب/ج-۲a sentinel connect درِ پارتیشن fail می‌شود (نه hang)', sentinelConnectRejected);
  await sleep(6000); /* > پنجرهٔ تسلیمِ قدیم (~۵.۲۵s) + حاشیه */
  const sentinelStatus = sentinelClient.status;
  try { sentinelClient.disconnect(); } catch (e) {}
  if (VULN) {
    chk('ب/ج-۲ (VULN) sentinel به \'end\' دائمی می‌رسد', sentinelStatus === 'end', 'status=' + sentinelStatus);
  } else {
    chk('ب/ج-۲ sentinel همچنان در حالِ بازتصل است (نه \'end\')', sentinelStatus !== 'end', 'status=' + sentinelStatus);
  }

  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`M14-C01 (${label}): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}
