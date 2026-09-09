#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/redis-audit.js — ممیزی کلیدهای Redis و TTL
   ───────────────────────────────────────────────────────────────────
   - همهٔ کلیدها را با SCAN امن (هرگز KEYS *) می‌خواند.
   - نوعِ مصرف، مالک و TTL هر کلید را گزارش می‌دهد.
   - کلیدهای بدون انقضا را هشدار می‌دهد مگر در فهرستِ «دائمیِ مجاز».
   خروجیِ ماژول برای تست: { KEY_SPECS, classifyKey, audit }
   اجرا:  node tools/redis-audit.js   (با محیطِ واقعیِ سرور: REDIS_URL)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

/* مشخصاتِ کلیدهای شناخته‌شده — الگو، مالک، انتظارِ انقضا.
   اگر کلید تازه‌ای به پروژه اضافه شد، همین‌جا ثبتش کنید. */
const KEY_SPECS = [
  { pattern: /^payesh:cache:bootstrap:/, owner: 'server/cache.js',          expectTtl: true,  note: 'بوت‌استرپ کاربر — پیش‌فرض ۳۰۰ ثانیه' },
  { pattern: /^payesh:rl:/,              owner: 'server/cache.js + waf.js', expectTtl: true,  note: 'محدودسازی نرخ — به‌اندازهٔ پنجره' },
  { pattern: /^payesh:idempotency:/,     owner: 'server/cache.js (sync)',   expectTtl: true,  note: 'ایدِمپوتِنسی — پیش‌فرض ۲۴ ساعت' },
  { pattern: /^payesh:lock:/,            owner: 'server/cache.js (P0-14)',  expectTtl: true,  note: 'قفل توزیع‌شده — تا پایان بحرانی' },
  { pattern: /^payesh:otp:state$/,       owner: 'server/otp-store.js',      expectTtl: false, note: 'حالتِ ورود — دائمیِ مجاز؛ هرسِ درون‌سندی دارد (کد ۵دقیقه، بقیه ۲۵ساعت)' },
  { pattern: /^rate:/,                   owner: 'server/rate-limit.js',     expectTtl: true,  note: 'شمارندهٔ پنجره‌ثابت — خوددرمانیِ بی‌TTL با incrWithTtl' }
];
const NO_EXPIRY_ALLOWED = [/^payesh:otp:state$/];

function classifyKey(key) {
  for (const spec of KEY_SPECS) {
    if (spec.pattern.test(key)) return spec;
  }
  return null; /* ناشناخته */
}

/**
 * @param {object} redis — درایور (server/redis)
 * @returns {Promise<{rows:Array, unknown:Array, orphaned:Array, okSummary:boolean}>}
 */
async function audit(redis) {
  const keys = await redis.scan();
  const rows = [];
  const unknown = [];
  const orphaned = [];

  for (const key of keys.sort()) {
    let ttlSec = -2;
    try { ttlSec = await redis.ttl(key); } catch (e) {}
    const spec = classifyKey(key);
    const row = {
      key,
      ttl: ttlSec,
      owner: spec ? spec.owner : '❓ نامشخص',
      note: spec ? spec.note : 'کلید ناشناخته — در KEY_SPECS ثبت شود',
      problem: null
    };
    if (!spec) {
      row.problem = 'unknown';
      unknown.push(key);
    } else if (ttlSec === -1) {
      if (!NO_EXPIRY_ALLOWED.some(rx => rx.test(key))) {
        row.problem = 'no-ttl';
        orphaned.push(key);
      }
    } else if (spec.expectTtl === false && ttlSec >= 0) {
      row.problem = 'unexpected-ttl';
    }
    rows.push(row);
  }

  return { rows, unknown, orphaned, total: rows.length, okSummary: unknown.length === 0 && orphaned.length === 0 };
}

function formatTtl(t) {
  if (t === -2) return '—(نبود)';
  if (t === -1) return 'دائمی';
  if (t >= 3600) return Math.round(t / 3600) + ' ساعت';
  if (t >= 60) return Math.round(t / 60) + ' دقیقه';
  return t + ' ثانیه';
}

/* ── CLI ──────────────────────────────────────────────────────────── */
if (require.main === module) {
  const redis = require(path.join(__dirname, '..', 'server', 'redis.js'));
  redis.init().then(async (r) => {
    if (!r || r.ok === false) {
      console.error('redis.init شکست خورد:', r && r.error);
      process.exit(1);
    }
    console.log(`▸ ممیزی کلیدهای Redis — درایور: ${r.driver}\n`);
    const { rows, unknown, orphaned, total, okSummary } = await audit(redis);
    if (total === 0) {
      console.log('هیچ کلیدی پیدا نشد (ردیسِ خالی یا محیطِ بدون ترافیک).');
    }
    for (const row of rows) {
      const mark = row.problem === 'no-ttl' ? '⚠️ ' : row.problem === 'unknown' ? '❓' : '  ';
      console.log(`${mark} ${row.key}\n     TTL: ${formatTtl(row.ttl)} · مالک: ${row.owner}${row.note ? ' · ' + row.note : ''}`);
    }
    console.log(`\nجمع: ${total} کلید · ناشناخته: ${unknown.length} · بی‌انقضای غیرمجاز: ${orphaned.length}`);
    if (!okSummary) {
      console.log('⚠️  وضعیت نیازمند رسیدگی است.');
      process.exit(2);
    }
    console.log('وضعیت سالم است ✅');
    try { await redis.close(); } catch (e) {}
    process.exit(0);
  }).catch((e) => { console.error('خطا:', e.message); process.exit(1); });
}

module.exports = { KEY_SPECS, classifyKey, audit, formatTtl };
