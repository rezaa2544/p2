#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   P0-13 — Redis fallback در تولید مجاز نیست (شکستِ ریدی)
   ۱) تولید بدون REDIS_URL            → init: {ok:false}
   ۲) تولید با ردیسِ غیرقابل‌اتصال     → init: {ok:false} (فال‌بک ممنوع)
   ۳) توسعه بدون ردیس                → init: {ok:true, driver:memory}
   ۴) توسعه با ردیسِ غیرقابل‌اتصال    → فال‌بک حافظه (رفتنِ توسعه)
   ۵) معنای ready() در دو محیط
   ۶) بوتِ واقعی: تولید بدون ردیس → سرور با خروجی غیرصفر می‌میرد
   ۷) بوتِ واقعی: توسعه بدون ردیس → سرور بالا می‌آید (200 + حافظه)
   اجرا:  node tests/redis-fallback.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const procs = [];

function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* اجرای ایزولهٔ redis.init() در فرزند با محیطِ دلخواه */
function runInit(extraEnv) {
  return new Promise((resolve) => {
    const script = "require('./server/redis').init().then(function(r){" +
      "console.log('RES:'+JSON.stringify({ok:r.ok,driver:r.driver,error:r.error||null}));" +
      "process.exit(0);}).catch(function(e){console.log('ERR:'+(e&&e.message));process.exit(2);});";
    const p = spawn(process.execPath, ['-e', script], {
      cwd: ROOT,
      env: Object.assign({}, process.env, extraEnv),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 25000);
    p.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

/* اجرای ایزولهٔ معنای ready() */
function runReady(extraEnv) {
  return new Promise((resolve) => {
    const script = "var r=require('./server/redis');console.log('READY:'+(r.ready()?'1':'0'));process.exit(0);";
    const p = spawn(process.execPath, ['-e', script], {
      cwd: ROOT,
      env: Object.assign({}, process.env, extraEnv),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 10000);
    p.on('exit', () => { clearTimeout(t); resolve(out); });
  });
}

/* بوتِ واقعی سرور با محیطِ دلخواه */
function bootServer(env) {
  const p = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, env),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  p.log = '';
  p.stdout.on('data', (d) => (p.log += d));
  p.stderr.on('data', (d) => (p.log += d));
  procs.push(p);
  return p;
}
function waitForExit(p, timeoutMs) {
  return new Promise((resolve) => {
    if (p.exitCode !== null) return resolve(p.exitCode);
    const t = setTimeout(() => resolve(null), timeoutMs);
    p.on('exit', (code) => { clearTimeout(t); resolve(code); });
  });
}
function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('exit', () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
});

async function main() {
  console.log('\n▸ P0-13 — ممنوعیت فال‌بک ردیس در تولید');

  /* ── ۱: تولید بدون REDIS_URL ─────────────────────────────────── */
  {
    const env = { NODE_ENV: 'production' };
    delete env.REDIS_URL;
    const r = await runInit(env);
    const m = r.out.match(/RES:(\{.*\})/);
    const j = m ? JSON.parse(m[1]) : null;
    chk('تولید بدون REDIS_URL → init شکست می‌خورد (ok:false)',
      !!j && j.ok === false && j.driver === 'none',
      r.out.slice(0, 160));
  }

  /* ── ۲: تولید با ردیسِ غیرقابل‌اتصال ─────────────────────────── */
  {
    const r = await runInit({ NODE_ENV: 'production', REDIS_URL: 'redis://127.0.0.1:6399' });
    const m = r.out.match(/RES:(\{.*\})/);
    const j = m ? JSON.parse(m[1]) : null;
    chk('تولید با ردیسِ غیرقابل‌اتصال → فال‌بک ممنوع (ok:false)',
      !!j && j.ok === false && j.driver === 'none',
      r.out.slice(0, 160));
  }

  /* ── ۳: توسعه بدون ردیس → حافظهٔ محلی ────────────────────────── */
  {
    const env = { NODE_ENV: 'development' };
    delete env.REDIS_URL;
    const r = await runInit(env);
    const m = r.out.match(/RES:(\{.*\})/);
    const j = m ? JSON.parse(m[1]) : null;
    chk('توسعه بدون ردیس → فال‌بک حافظه مجاز (ok:true, memory)',
      !!j && j.ok === true && j.driver === 'memory',
      r.out.slice(0, 160));
  }

  /* ── ۴: توسعه با ردیسِ غیرقابل‌اتصال → فال‌بک ────────────────── */
  {
    const r = await runInit({ NODE_ENV: 'development', REDIS_URL: 'redis://127.0.0.1:6399' });
    const m = r.out.match(/RES:(\{.*\})/);
    const j = m ? JSON.parse(m[1]) : null;
    chk('توسعه با ردیسِ قطع → فال‌بک حافظه (رفتنِ محیط توسعه)',
      !!j && j.ok === true && j.driver === 'memory',
      r.out.slice(0, 160));
  }

  /* ── ۵: معنای ready() ────────────────────────────────────────── */
  {
    const prodOut = await runReady({ NODE_ENV: 'production' });
    const devOut = await runReady({ NODE_ENV: 'development' });
    chk('ready() در تولید بدون اتصال = نادرست', /READY:0/.test(prodOut), prodOut.slice(0, 80));
    chk('ready() در توسعه (حافظه) = درست', /READY:1/.test(devOut), devOut.slice(0, 80));
  }

  /* ── ۶: بوتِ واقعی — تولید بدون ردیس باید بمیرد ──────────────── */
  {
    const env = { NODE_ENV: 'production', PORT: '8962' };
    delete env.REDIS_URL;
    const p = bootServer(env);
    const code = await waitForExit(p, 12000);
    chk('بوتِ تولید بدون ردیس → سرور با خروجی غیرصفر شکست می‌خورد',
      code !== null && code !== 0,
      `exit=${code} log=${p.log.slice(0, 140).replace(/\n/g, ' | ')}`);
    chk('پیام شکستِ ریدی در خروجی ثبت می‌شود', /FATAL.*[Cc]ache readiness/i.test(p.log), p.log.slice(0, 140));
  }

  /* ── ۷: بوتِ واقعی — توسعه بدون ردیس بالا می‌آید ─────────────── */
  {
    const env = { NODE_ENV: 'development', PORT: '8963' };
    delete env.REDIS_URL;
    const p = bootServer(env);
    let hc = null;
    for (let i = 0; i < 30 && !hc; i++) { await sleep(300); hc = await healthCheck(8963); }
    let okHc = false, devMode = false;
    if (hc && hc.status === 200) {
      try {
        const j = JSON.parse(hc.body);
        okHc = j.ok === true;
        devMode = j.cache === 'memory-dev';
      } catch (e) {}
    }
    chk('بوتِ توسعه بدون ردیس → سرور سرویس می‌دهد (200)', okHc,
      hc ? `status=${hc.status}` : 'health بی‌پاسخ');
    chk('هلث حالت کش را گزارش می‌کند (memory-dev)', devMode, hc ? hc.body.slice(0, 120) : '-');
    try { p.kill('SIGKILL'); } catch (e) {}
  }

  console.log(`\nredis-fallback (P0-13): ${pass}/${pass + fail} موفق  —  ${fail ? '❌ ' + fail + ' خطا' : 'بدون خطا ✅'}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
