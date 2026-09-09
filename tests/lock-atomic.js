#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   P0-14 — قفل توزیع‌شدهٔ اتمیک (SET NX EX + آزادسازی با توکن)
   ۱) دو دریافت‌کنندهٔ همزمان → دقیقاً یکی برنده
   ۲) آزادسازی با توکن اشتباه → قفل دست‌نخورده می‌ماند
   ۳) صاحب قفل آزاد می‌کند و دیگری می‌تواند بگیرد
   ۴) انقضای قفل: آزادسازی صاحبِ منقضی‌شده بی‌اثر است و دارندهٔ جدید نمی‌میرد
   ۵) انبوه همزمان (۵۰) → دقیقاً یک برنده
   ۶) دو «نمونهٔ سرویس» روی یک درایور: انحصار متقابل برقرار است
   اجرا:  node tests/lock-atomic.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

delete process.env.NODE_ENV;      // حالت توسعه → درایور حافظه
delete process.env.REDIS_URL;

const redis = require(path.join(__dirname, '..', 'server', 'redis.js'));
const cache = require(path.join(__dirname, '..', 'server', 'cache.js'));

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  console.log('▸ P0-14 — قفل توزیع‌شدهٔ اتمیک');
  const r = await redis.init();
  if (!r || r.ok === false) { console.log('  ❌ redis.init شکست خورد'); process.exit(1); }

  // ۱) دو دریافت‌کنندهٔ همزمان → دقیقاً یکی برنده
  {
    const [a, b] = await Promise.all([
      cache.acquireLock('p14:key1', 30),
      cache.acquireLock('p14:key1', 30)
    ]);
    const winners = [a, b].filter(t => typeof t === 'string');
    chk('دو همزمان → دقیقاً یک برنده', winners.length === 1, `برندگان=${winners.length}`);
    chk('بازندهٔ همزمان مقدار تهی می‌گیرد', (a === null) !== (b === null));
    await cache.releaseLock('p14:key1', winners[0]);
  }

  // ۲) آزادسازی با توکن اشتباه
  {
    const token = await cache.acquireLock('p14:key2', 30);
    const wrong = await cache.releaseLock('p14:key2', 'token-e-shtebah');
    chk('آزادسازی با توکن اشتباه رد می‌شود', wrong === false);
    const retry = await cache.acquireLock('p14:key2', 30);
    chk('قفل پس از تلاش اشتباه هنوز گرفته است', retry === null);
    await cache.releaseLock('p14:key2', token);
  }

  // ۳) آزادسازی صاحب + دریافت دوباره
  {
    const t1 = await cache.acquireLock('p14:key3', 30);
    const rel = await cache.releaseLock('p14:key3', t1);
    chk('صاحب قفل آزاد می‌کند', rel === true);
    const t2 = await cache.acquireLock('p14:key3', 30);
    chk('نمونهٔ دیگر پس از آزادی می‌گیرد', typeof t2 === 'string' && t2 !== t1);
    await cache.releaseLock('p14:key3', t2);
  }

  // ۴) انقضا: توکنِ صاحبِ منقضی‌شده نباید قفلِ جدید را بکُشد
  {
    const stale = await cache.acquireLock('p14:key4', 1);
    await new Promise(res => setTimeout(res, 1300));
    const fresh = await cache.acquireLock('p14:key4', 30);
    chk('قفل منقضی به دارندهٔ جدید می‌رسد', typeof fresh === 'string');
    const staleRelease = await cache.releaseLock('p14:key4', stale);
    chk('آزادسازی توکن منقضی‌شده بی‌اثر است', staleRelease === false);
    const still = await cache.acquireLock('p14:key4', 30);
    chk('دارندهٔ جدید قفلش را نگه می‌دارد', still === null);
    await cache.releaseLock('p14:key4', fresh);
  }

  // ۵) ۵۰ دریافت‌کنندهٔ همزمان → یک برنده
  {
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.acquireLock('p14:key5', 30)));
    const winners = results.filter(t => typeof t === 'string');
    chk('پنجاه همزمان → دقیقاً یک برنده', winners.length === 1, `برندگان=${winners.length}`);
    await cache.releaseLock('p14:key5', winners[0]);
  }

  // ۶) دو «نمونهٔ سرویس» روی یک درایور مشترک — انحصار متقابل دو طرفه
  {
    const tokA = await cache.acquireLock('p14:key6', 30);
    const tokB = await cache.acquireLock('p14:key6', 30);
    chk('نمونهٔ ب وقتی الف قفل دارد، نمی‌گیرد', tokA !== null && tokB === null);
    await cache.releaseLock('p14:key6', tokA);
    const tokB2 = await cache.acquireLock('p14:key6', 30);
    chk('پس از آزادیِ الف، ب می‌گیرد', typeof tokB2 === 'string');
    await cache.releaseLock('p14:key6', tokB2);
  }

  await redis.close();
  console.log(`\nlock-atomic (P0-14): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
