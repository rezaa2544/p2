#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   redis-cluster.js — فاز ۲.۱: اتصال و شکست‌خورد (Sentinel/Cluster)
   ───────────────────────────────────────────────────────────────────
   بخش آ (همیشه اجرا): پیکربندیِ ساخته‌شده از محیط —
     C1 حالت پیش‌فرض بدون هیچ متغیر = حافظه
     C2 پارسِ standalone از REDIS_URL
     C3 پارسِ Sentinel (چند نشانی + نام پیش‌فرض/صریح + رمز)
     C4 پارسِ Cluster (≥۳ نود، اولویت بر Sentinel/URL)
     C5 ورودی نامعتبر ⇒ رد (بدون کرش)
     C6 انزوای محیط: دو پروسه با محیط متفاوت، حالت متفاوت می‌گیرند
   بخش ب (نیازمند ردیس واقعی — بدون آن خودکار رد می‌شود):
     L1 اتصال + نوشتن/خواندن/حذف + TTL + INCR
     L2 در حالت Sentinel: کشفِ مستر از دیدِ ناظران (پیش‌زمینهٔ شکست‌خورد)
     همهٔ فراخوانی‌های زنده با ددلاین پیچیده شده‌اند (درسِ آویزان‌شدنِ
     کلاینتِ سنیتنل در سنبوکس).
   اجرا:  node tests/redis-cluster.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}

function withDeadline(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('deadline: ' + label)), ms))
  ]);
}

/* اجرای کوئد در پروسهٔ فرزند با محیطِ کنترل‌شده (ردیس در بارگذاری محیط می‌خواند) */
function childEval(env, expr) {
  const r = spawnSync(process.execPath, ['-e', `
    const redis = require(${JSON.stringify(path.join(ROOT, 'server', 'redis.js'))});
    Promise.resolve().then(async () => { ${expr} }).catch(e => { console.log('ERR:' + e.message); process.exit(2); });
  `], { cwd: ROOT, env: Object.assign({}, { PATH: process.env.PATH, NODE_PATH: process.env.NODE_PATH || '' }, env), encoding: 'utf8', timeout: 20000 });
  return (r.stdout || '') + (r.stderr || '');
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  console.log('\n▸ فاز ۲.۱ — ردیس: پیکربندی و اتصال');
  const { buildRedisConfig } = require(path.join(ROOT, 'server', 'redis.js'));

  /* ── بخش آ: پیکربندی ── */
  console.log('— پیکربندی از محیط —');

  chk('C1 بدون متغیر ⇒ حافظه', (() => {
    const c = buildRedisConfig({});
    return c.mode === 'memory';
  })());

  chk('C2 پارسِ standalone', (() => {
    const c = buildRedisConfig({ REDIS_URL: 'redis://10.0.0.5:6379' });
    return c.mode === 'standalone' && c.url === 'redis://10.0.0.5:6379';
  })());

  chk('C3 پارسِ Sentinel: سه ناظر + نام صریح + رمز', (() => {
    const c = buildRedisConfig({
      REDIS_SENTINELS: '10.0.0.1:26379, 10.0.0.2:26379,10.0.0.3:26379',
      REDIS_SENTINEL_NAME: 'payesh-master',
      REDIS_PASSWORD: 's3cret'
    });
    return c.mode === 'sentinel' && c.sentinels.length === 3
      && c.sentinels[0].host === '10.0.0.1' && c.sentinels[0].port === 26379
      && c.name === 'payesh-master' && c.password === 's3cret';
  })());

  chk('C3b نام پیش‌فرض سنیتنل = mymaster', (() => {
    const c = buildRedisConfig({ REDIS_SENTINELS: '10.0.0.1:26379' });
    return c.name === 'mymaster';
  })());

  chk('C4 پارسِ Cluster و اولویتش بر بقیه', (() => {
    const c = buildRedisConfig({
      REDIS_CLUSTER_NODES: '10.0.0.1:7000,10.0.0.2:7000,10.0.0.3:7000',
      REDIS_SENTINELS: '10.0.0.9:26379',
      REDIS_URL: 'redis://10.0.0.8:6379'
    });
    return c.mode === 'cluster' && c.nodes.length === 3
      && c.nodes[2].port === 7000
      && c.clusterOptions.scaleReads === 'master';
  })());

  chk('C5 ورودی نامعتبر ⇒ رد', (() => {
    const bad1 = buildRedisConfig({ REDIS_SENTINELS: '10.0.0.1' });          /* بدون پورت */
    const bad2 = buildRedisConfig({ REDIS_CLUSTER_NODES: '10.0.0.1:99999' }); /* پورت نامعتبر */
    return bad1.mode === 'memory' && bad2.mode === 'memory';
  })());

  chk('C6 انزوای محیط در پروسهٔ فرزند', (() => {
    const a = childEval({}, `console.log('MODE:' + redis.buildRedisConfig(process.env).mode);`);
    const b = childEval({ REDIS_SENTINELS: '127.0.0.1:26379' }, `console.log('MODE:' + redis.buildRedisConfig(process.env).mode);`);
    return a.indexOf('MODE:memory') > -1 && b.indexOf('MODE:sentinel') > -1;
  })());

  /* ── بخش ب: اتصال زنده ── */
  const live = process.env.REDIS_URL || process.env.REDIS_SENTINELS || process.env.REDIS_CLUSTER_NODES;
  if (!live) {
    console.log('\n⏭️  بخش زنده رد شد — هیچ‌کدام از REDIS_URL / REDIS_SENTINELS / REDIS_CLUSTER_NODES تنظیم نیست.');
    console.log('   (در سنبوکس سرور ردیس موجود نیست؛ استقرار واقعی در راهنمای');
    console.log('    docs/REDIS_CLUSTER_SETUP.md توضیح داده شده است.)');
  } else {
    console.log('\n— اتصال زنده —');
    const redis = require(path.join(ROOT, 'server', 'redis.js'));
    try {
      const initRes = await withDeadline(redis.init(), 8000, 'init');
      chk('L1 init انجام شد', initRes && initRes.ok, JSON.stringify(initRes));
      if (initRes && initRes.ok && initRes.driver === 'redis') {
        const key = 'payesh:cluster-test:' + Date.now();
        await withDeadline(redis.set(key, 'ok', 'EX', 30), 5000, 'set');
        const v = await withDeadline(redis.get(key), 5000, 'get');
        chk('L1 نوشتن/خواندن', v === 'ok', v);
        const t = await withDeadline(redis.ttl(key), 5000, 'ttl');
        chk('L1 TTL ست شده', t > 0 && t <= 30, t);
        const n1 = await withDeadline(redis.incr('payesh:cluster-counter:test'), 5000, 'incr1');
        const n2 = await withDeadline(redis.incr('payesh:cluster-counter:test'), 5000, 'incr2');
        chk('L1 شمارش اتمیک', n2 === n1 + 1, n1 + '→' + n2);
        await withDeadline(redis.del(key, 'payesh:cluster-counter:test'), 5000, 'del');

        if (initRes.mode === 'sentinel') {
          /* کشف مستر: پینگ از هر سه ناظر باید یک مستر مشترک گزارش کنند */
          const ioredis = require('ioredis');
          const sentinels = String(process.env.REDIS_SENTINELS).split(',').map(s => {
            const p = s.trim().split(':'); return { host: p[0], port: Number(p[1]) };
          });
          const masters = new Set();
          for (const s of sentinels) {
            try {
              const c = new ioredis({ host: s.host, port: s.port, connectTimeout: 2500, lazyConnect: true });
              await withDeadline(c.connect(), 4000, 'sentinel ' + s.host);
              const m = await withDeadline(c.sentinel('get-master-addr-by-name', process.env.REDIS_SENTINEL_NAME || 'mymaster'), 4000, 'master-addr');
              if (m) masters.add(m[0] + ':' + m[1]);
              c.disconnect();
            } catch (e) { /* ناظرِ دسترس‌ناپذیر = بخشی از آزمون شکست‌خورد */ }
          }
          chk('L2 همهٔ ناظرانِ پاسخ‌گو یک مستر واحد می‌بینند', masters.size === 1, JSON.stringify([...masters]));
        } else {
          chk('L2 در حالت غیرسنیتنل: وضعیت سالم گزارش می‌شود', redis.getStatus().active === true, JSON.stringify(redis.getStatus()));
        }
      } else {
        chk('L1 اتصال زنده (خطا در اتصال به سرور معرفی‌شده)', false, JSON.stringify(initRes));
      }
      await redis.close();
    } catch (e) {
      chk('L1/L2 بدون خطا', false, e.message);
      try { await require(path.join(ROOT, 'server', 'redis.js')).close(); } catch (e2) {}
    }
  }

  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`ردیس کلاستر/سنیتنل: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}
