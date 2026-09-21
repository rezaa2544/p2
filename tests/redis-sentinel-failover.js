#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   P0-HA — مستندسازی/پیاده‌سازی Redis Sentinel و فیل‌اُوور
   ۱) پارسِ پیکربندی سنتینل (تابع خالص)
   ۲) حلِ حالت: سنتینل/مستقل/حافظه از روی محیط
   ۳) قرارداد فیل‌اُوور: سنتینلِ غیرقابل‌دسترس در تولید = شکستِ ریدی
      (فال‌بک ممنوع — همان قرارداد پی۰-۱۳) و در توسعه = حافظه
   ۴) سلامتِ ساختار کانفیگ برای آیورِدیس (بدون نیاز به سرور)
   ۵) شبیه‌سازی واقعیِ فیل‌اُوور — فقط اگر باینری‌های ردیس موجود باشند
      (در محیطِ فاقد باینری، اطلاع‌رسانیِ رد شدن می‌آید نه شکست)
   اجرا:  node tests/redis-sentinel-failover.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const redis = require(path.join(ROOT, 'server', 'redis.js'));

let pass = 0, fail = 0, skipped = 0;

const SENSITIVE_KEY_RE = /(pass(word)?|secret|token|api[-_]?key|authorization|cookie)/i;

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) out[k] = '[REDACTED]';
    else out[k] = redactSensitive(v);
  }
  return out;
}

function redactSensitiveText(text) {
  return String(text)
    .replace(/((?:pass(?:word)?|secret|token|api[-_]?key|authorization|cookie)\s*[:=]\s*)([^,\s;]+)/ig, '$1[REDACTED]')
    .replace(/("(?:pass(?:word)?|secret|token|api[-_]?key|authorization|cookie)"\s*:\s*")([^"]*)(")/ig, '$1[REDACTED]$3');
}

function sanitizeDetail(detail) {
  if (detail == null || detail === '') return '';
  if (typeof detail === 'string') {
    try {
      return JSON.stringify(redactSensitive(JSON.parse(detail)));
    } catch (e) {
      return redactSensitiveText(detail);
    }
  }
  if (typeof detail === 'object') {
    return JSON.stringify(redactSensitive(detail));
  }
  return redactSensitiveText(String(detail));
}

function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else {
    fail++;
    const safeDetail = sanitizeDetail(detail);
    console.log(`  ❌ ${name}${safeDetail ? ' — ' + safeDetail : ''}`);
  }
}
function skip(name, why) {
  skipped++;
  console.log(`  ⏭️  ${name} — رد شد (${why})`);
}

/* اجرای ایزولهٔ یک اسکریپت با محیطِ دلخواه (کانفیگ ردیس در بارگذاری خوانده می‌شود) */
function runChild(script, extraEnv) {
  return new Promise((resolve) => {
    const p = cp.spawn(process.execPath, ['-e', script], {
      cwd: ROOT,
      env: Object.assign({}, process.env, extraEnv),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} resolve('TIMEOUT'); }, 25000);
    p.on('exit', (code) => { clearTimeout(timer); resolve(out.trim() + '\nEXIT:' + code); });
  });
}

function findRedisBinaries() {
  const cands = ['/usr/bin/redis-server', '/usr/local/bin/redis-server', '/opt/redis/bin/redis-server'];
  for (const c of cands) { try { if (fs.existsSync(c)) return { server: c, sentinel: c.replace('redis-server', 'redis-sentinel') }; } catch (e) {} }
  try {
    const w = cp.execSync('which redis-server', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w && fs.existsSync(w)) return { server: w, sentinel: w.replace('redis-server', 'redis-sentinel') };
  } catch (e) {}
  return null;
}

async function main() {
  console.log('▸ P0-HA — Redis Sentinel و فیل‌اُوور');

  // ۱) پارسِ پیکربندی (تابع خالص)
  {
    /* ری‌تارگت (موج مرج ۱۸۹-۲۰۴): API جاری main = buildRedisConfig(env) —
       همان قرارداد، ورودی env-محور. */
    const c1 = redis.buildRedisConfig({ REDIS_SENTINELS: '10.0.0.1:26379, 10.0.0.2:26379,10.0.0.3:26379', REDIS_SENTINEL_NAME: 'mymaster' });
    chk('سه نگهبان با نام مستر پارس می‌شوند',
      c1.mode === 'sentinel' && c1.name === 'mymaster' && c1.sentinels.length === 3 && c1.sentinels[2].port === 26379,
      JSON.stringify(c1));
    /* قراردادِ جاریِ main سخت‌گیرانه‌تر است: host بدونِ پورت پذیرفته نمی‌شود
       (fail-fast به‌جای حدسِ پورت)؛ پورت/نامِ پیش‌فرض با ورودیِ صریح سنجیده می‌شود. */
    const c2 = redis.buildRedisConfig({ REDIS_SENTINELS: '10.0.0.9:26379' });
    chk('پورت صریح ۲۶۳۷۹ و نام پیش‌فرض mymaster', c2.sentinels[0].port === 26379 && c2.name === 'mymaster', JSON.stringify(c2));
    const c2b = redis.buildRedisConfig({ REDIS_SENTINELS: '10.0.0.9' });
    chk('host بدون پورت ⇒ سنتینل ساخته نمی‌شود (fail-fast قرارداد main)', c2b.mode !== 'sentinel', JSON.stringify(c2b));
    const c3 = redis.buildRedisConfig({ REDIS_SENTINELS: '  ,  ,' });
    chk('ورودی تهی → حالت سنتینل نمی‌سازد (fallback زنجیره)', c3.mode !== 'sentinel');
  }

  // ۲) حلِ حالت از روی محیط (فرزندِ ایزوله)
  {
    const out1 = await runChild(
      "const r=require('./server/redis.js');console.log('MODE:'+r.buildRedisConfig(process.env).mode);process.exit(0);",
      { REDIS_SENTINELS: '127.0.0.1:26379', REDIS_URL: 'redis://127.0.0.1:6379' });
    chk('با فهرست نگهبان، حالت سنتینل است', out1.indexOf('MODE:sentinel') !== -1, out1.slice(0, 120));
    const out2 = await runChild(
      "const r=require('./server/redis.js');console.log('MODE:'+r.buildRedisConfig(process.env).mode);process.exit(0);",
      { REDIS_SENTINELS: '', REDIS_URL: 'redis://127.0.0.1:6379' });
    chk('بدون نگهبان، حالت مستقل است', out2.indexOf('MODE:standalone') !== -1, out2.slice(0, 120));
  }

  // ۳) قرارداد فیل‌اُوور با سنتینلِ غیرقابل‌دسترس
  {
    const prodScript =
      "require('./server/redis.js').init().then(function(r){" +
      "console.log('RES:'+JSON.stringify({ok:r.ok,driver:r.driver,error:r.error||null}));process.exit(0);});";
    const outProd = await runChild(prodScript, {
      NODE_ENV: 'production', REDIS_URL: '', REDIS_SENTINELS: '127.0.0.1:59999'
    });
    chk('تولید + نگهبانِ مرده → شکستِ ریدی (فال‌بک ممنوع)',
      outProd.indexOf('"ok":false') !== -1, outProd.slice(0, 200));

    const outDev = await runChild(prodScript, {
      NODE_ENV: '', REDIS_URL: '', REDIS_SENTINELS: '127.0.0.1:59999'
    });
    chk('توسعه + نگهبانِ مرده → فال‌بک حافظه',
      outDev.indexOf('"ok":true') !== -1 && outDev.indexOf('"driver":"memory"') !== -1, outDev.slice(0, 200));
  }

  // ۴) سلامتِ ساختار کانفیگ برای آیورِدیس (بدون اتصال)
  {
    let ok = false, detail = '';
    try {
      let Redis = null;
      try { Redis = require('ioredis'); } catch (e) {}
      if (!Redis) {
        skip('آیورِدیس کانفیگ سنتینل ما را می‌پذیرد', 'ماژول ioredis نصب نشده است');
      } else {
        const cc = redis.buildRedisConfig({ REDIS_SENTINELS: '127.0.0.1:59999', REDIS_SENTINEL_NAME: 'mymaster' });
        const c = Object.assign({ sentinels: cc.sentinels, name: cc.name }, cc.options || {});
        const probe = new Redis(Object.assign({}, c, { lazyConnect: true, connectTimeout: 500 }));
        ok = !!(probe.options && Array.isArray(probe.options.sentinels) && probe.options.sentinels.length === 1 && probe.options.name === 'mymaster');
        try { probe.disconnect(); } catch (e) {}
        chk('آیورِدیس کانفیگ سنتینل ما را می‌پذیرد', ok, detail);
      }
    } catch (e) { detail = e.message; chk('آیورِدیس کانفیگ سنتینل ما را می‌پذیرد', false, detail); }
  }

  // ۵) شبیه‌سازی واقعی فیل‌اُوور (مشروط به باینری‌ها)
  {
    const bins = findRedisBinaries();
    if (!bins) {
      skip('شبیه‌سازی واقعی فیل‌اُوور', 'باینری‌های ردیس در این محیط نیست');
    } else {
      /* این بخش فقط در محیط‌های دارای ردیس اجرا می‌شود:
         مستر ۶۴۰۰ + کپی ۶۴۰۱ + سه نگهبان ۲۶۴۰۰–۲؛ کشتنِ مستر و
         مشاهدهٔ صعودِ کپی از دیدِ کلاینتِ اپ. */
      const dir = fs.mkdtempSync('/tmp/redis-ha-');
      const procs = [];
      const spawnR = (args) => {
        const p = cp.spawn(bins.server, args, { stdio: 'ignore' });
        procs.push(p); return p;
      };
      try {
        spawnR(['--port', '6400', '--daemonize', 'no', '--save', '', '--dir', dir]);
        spawnR(['--port', '6401', '--daemonize', 'no', '--save', '', '--dir', dir, '--replicaof', '127.0.0.1', '6400']);
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        await sleep(800);
        const sentinelConf = (port) => {
          const f = path.join(dir, 'sentinel-' + port + '.conf');
          fs.writeFileSync(f, [
            'port ' + port,
            'sentinel monitor mymaster 127.0.0.1 6400 2',
            'sentinel down-after-milliseconds mymaster 2000',
            'sentinel failover-timeout mymaster 10000',
            'sentinel parallel-syncs mymaster 1'
          ].join('\n'));
          const p = cp.spawn(bins.server, [f, '--sentinel'], { stdio: 'ignore' });
          procs.push(p); return p;
        };
        sentinelConf(26400); sentinelConf(26401); sentinelConf(26402);
        await sleep(1200);

        const Redis = require(path.join(ROOT, 'node_modules', 'ioredis'));
        const cc = redis.buildRedisConfig({ REDIS_SENTINELS: '127.0.0.1:26400,127.0.0.1:26401,127.0.0.1:26402', REDIS_SENTINEL_NAME: 'mymaster' });
        const c = Object.assign({ sentinels: cc.sentinels, name: cc.name }, cc.options || {});
        const app = new Redis(Object.assign({}, c, { connectTimeout: 2000, maxRetriesPerRequest: 3 }));
        await app.set('ha:probe', 'alive');
        chk('نوشت روی مستر از مسیر نگهبان', (await app.get('ha:probe')) === 'alive');

        /* کشتنِ مستر */
        procs[0].kill('SIGKILL');
        let ok = false;
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const v = await app.get('ha:probe');
            if (v === 'alive') { ok = true; break; }
          } catch (e) { /* هنوز فیل‌اُوور تمام نشده */ }
        }
        chk('پس از مرگ مستر، کلاینت مستر تازه را پیدا می‌کند', ok);
        try { app.disconnect(); } catch (e) {}
      } catch (e) {
        chk('شبیه‌سازی واقعی فیل‌اُوور', false, e.message);
      } finally {
        for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }

  console.log(`\nredis-sentinel-failover (P0-HA): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}${skipped ? ' · ردشده: ' + skipped : ''}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
