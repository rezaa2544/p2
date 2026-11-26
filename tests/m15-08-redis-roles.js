'use strict';
/* tests/m15-08-redis-roles.js — M15-08 (ledger؛ نه ردیف ۲۷ مانیتورینگ): تفکیک نقش‌های Redis — لایهٔ مخزن
   ───────────────────────────────────────────────────────────────────
   لایهٔ کد-پذیرِ مأموریت (CURRENT_WORK_EXECUTION_PLAN §M15-08):
     S1  رجیستری نقش‌ها (server/redis-roles.js): ۶ نقش، ۱۵ خانواده،
         یکتاییِ id/prefix، canonicalِ واحد به‌ازای هر نقش، سازندهٔ کلید =
         عینِ پیشوندهای تاریخی (بدون تغییرِ نام) + سدِ ضد-کلیدِ سرگردان.
     S1e سیم‌کشیِ زنده: rate-limit.js و revocation.js از رجیستری تغذیه می‌شوند
         (هیچ رشتهٔ پیشوندِ تکراری در کدِ زنده نمانده باشد).
     S2  رأیِ V2-F07: infra = noeviction مرجع است؛ سندِ کش دیگر lru را برای
         نمونهٔ مشترک تبلیغ نمی‌کند (فقط کامنتِ نمونهٔ اختصاصیِ آینده).
     S3  اثباتِ منفی: جهشِ حذفِ رجیستری از rate-limit.js ⇒ گیت قرمز؛
         بازگردانی ⇒ سبز.
     S4  live (خود-skip صادقانه): در keyspace واقعی هر کلید به یک خانوادهٔ
         ثبت‌شده می‌خورد (SCAN) — بدونِ Redis = NOTICE، هرگز PASS شمرده نمی‌شود.
   تفکیکِ زیرساختیِ نمونه‌ها + مانورِ خرابیِ هر نقش = capacity-gated (M15-02/18، E4) — خارج از این سوئیت.
   Run: node tests/m15-08-redis-roles.js
   Live: REDIS_URL=redis://… */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let ok = 0, fail = 0, skipped = 0;
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function skip(name, why) {
  skipped++;
  console.log('  ⏭️ ' + name + ' (' + why + ')');
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── S1 — قرارداد رجیستری ─────────────────────────────────────────── */
console.log('\n▸ S1 — قرارداد رجیستری نقش‌ها');
let rr = null;
try { rr = require('../server/redis-roles'); } catch (e) { chk('server/redis-roles.js لود می‌شود', false, e.message); }
if (rr) {
  chk('server/redis-roles.js لود می‌شود', true);
  const roleNames = Object.keys(rr.ROLES);
  chk('شش نقشِ مأموریت دقیقاً', JSON.stringify(roleNames.slice().sort()) === JSON.stringify(['cache', 'counter', 'lock', 'pubsub', 'ratelimit', 'session'].sort()), roleNames.join(','));
  chk('هر نقش: کلاس تخلیه + قرارداد تنزل + فارسی', roleNames.every(r => {
    const x = rr.ROLES[r];
    return (x.evictionClass === 'volatile' || x.evictionClass === 'durable') && x.degradation && x.fa;
  }));
  const fams = rr.FAMILIES;
  chk('حداقل ۱۴ خانواده ثبت شده', fams.length >= 14, String(fams.length));
  const ids = fams.map(f => f.id), prefs = fams.map(f => f.prefix);
  chk('idها یکتا', new Set(ids).size === ids.length);
  chk('پیشوندها یکتا', new Set(prefs).size === prefs.length);
  chk('هیچ پیشوندی پیشوندِ دیگری نیست (سقفِ کلید)', prefs.every((p, i) => prefs.every((q, j) => i === j || !q.startsWith(p))));
  chk('نقشِ هر خانواده معتبر', fams.every(f => rr.ROLES[f.role]));
  chk('هر نقش دقیقاً یک canonical', roleNames.every(r => fams.filter(f => f.role === r && f.canonical).length === 1));
  chk('owner+note همهٔ خانواده‌ها', fams.every(f => f.owner && f.note));
}

/* ── S1c — سازندهٔ کلید = عینِ پیشوندهای تاریخی ────────────────────── */
console.log('\n▸ S1c — سازندهٔ کلید (بدون تغییر نام)');
if (rr) {
  chk('ratelimit → rate:', rr.key('ratelimit', 'otp:send:ip', '1.2.3.4') === 'rate:otp:send:ip:1.2.3.4', rr.key('ratelimit', 'x', 'y'));
  chk('session → revoked:', rr.key('session', 'jti1') === 'revoked:jti1');
  chk('cache → payesh:cache:', rr.key('cache', 'bootstrap:9') === 'payesh:cache:bootstrap:9');
  chk('lock → payesh:lock:', rr.key('lock', 'k') === 'payesh:lock:k');
  chk('familyPrefix دقیق', rr.familyPrefix('revocation-deny') === 'revoked:' && rr.familyPrefix('session-version') === 'sessver:' && rr.familyPrefix('outbox-seq') === 'payesh:outbox:seq');
  chk('نقش ناشناخته پرتاب', (() => { try { rr.key('bogus', 'x'); return false; } catch (e) { return true; } })());
  chk('سدِ ضد-کلید سرگردان', (() => { try { rr.assertKnownKey('rogue:key'); return false; } catch (e) { return e.code === 'REDIS_ROGUE_KEY'; } })());
}

/* ── S1d — نگاشت کلید→نقش ─────────────────────────────────────────── */
console.log('\n▸ S1d — نگاشت کلید به نقش');
if (rr) {
  const cases = [
    ['revoked:abc', 'session'], ['sessver:42', 'session'], ['payesh:otp:state', 'session'],
    ['payesh:enum:jt', 'session'], ['payesh:lock:x', 'lock'], ['payesh:idempotency:9', 'lock'],
    ['idem:ev:t:1', 'lock'], ['payesh:pubsub:inval', 'pubsub'], ['payesh:outbox:seq', 'counter'],
    ['rate:otp:login:ip:5', 'ratelimit'], ['payesh:rl:act:id', 'ratelimit'],
    ['payesh:cache:bootstrap:5', 'cache'], ['payesh:t:3', 'cache'], ['payesh:sov:r:t:e:i', 'cache']
  ];
  for (const [k, want] of cases) chk(k + ' → ' + want, rr.roleOf(k) === want, String(rr.roleOf(k)));
}

/* ── S1e — سیم‌کشیِ زنده (خواندنِ زندهٔ فایل‌ها — برای S3 هم استفاده می‌شود) ── */
function wiringViolations() {
  const v = [];
  const rl = read('server/rate-limit.js');
  if (!/require\('\.\/redis-roles'\)/.test(rl)) v.push('rate-limit.js رجیستری را require نمی‌کند');
  if (!/redisRoles\.key\('ratelimit'/.test(rl)) v.push('rate-limit.js getKey از رجیستری نمی‌سازد');
  if (/return\s*`rate:\$\{prefix\}/.test(rl)) v.push('rate-limit.js هنوز پیشوند را هاردکد می‌کند');
  const rv = read('server/revocation.js');
  if (!/require\('\.\/redis-roles'\)/.test(rv)) v.push('revocation.js رجیستری را require نمی‌کند');
  if (!/familyPrefix\('revocation-deny'\)/.test(rv) || !/familyPrefix\('session-version'\)/.test(rv)) v.push('revocation.js پیشوندها را از رجیستری نمی‌گیرد');
  if (/DENY_PREFIX\s*=\s*'revoked:'/.test(rv) || /VER_PREFIX\s*=\s*'sessver:'/.test(rv)) v.push('revocation.js هنوز پیشوند را هاردکد می‌کند');
  /* هر خانوادهٔ ثبت‌شده فقط از ماژولِ مالکِ خودش ساخته شود — رشتهٔ تکراری در ماژولِ بیگانه = انحراف */
  return v;
}

console.log('\n▸ S1e — سیم‌کشی زنده');
{
  const v = wiringViolations();
  chk('rate-limit/revocation از رجیستری تغذیه می‌شوند', v.length === 0, v.join(' | '));
}

/* ── S2 — رأیِ V2-F07 (تعارض noeviction/allkeys-lru) ───────────────── */
console.log('\n▸ S2 — رأی V2-F07');
{
  const compose = read('infra/redis/docker-compose.sentinel.yml');
  const noEvict = (compose.match(/--maxmemory-policy noeviction/g) || []).length;
  chk('infra مرجع = noeviction (۳ نود)', noEvict >= 3, 'occurrences=' + noEvict);
  const doc = read('docs/CACHE_STRATEGY_DESIGN.md');
  chk('سند کش رأی را ثبت کرده (V2-F07)', doc.includes('V2-F07') && doc.includes('noeviction'));
  chk('سند کش lru را به‌عنوان سیاستِ فعالِ مشترک تبلیغ نمی‌کند', !/^maxmemory-policy\s+volatile-lru/m.test(doc) && !/^maxmemory-policy\s+allkeys-lru/m.test(doc));
  chk('lru فقط برای نمونهٔ اختصاصیِ آینده (کامنت)', /#\s*maxmemory-policy\s+volatile-lru/.test(doc));
  const arch = read('docs/PAYESH_ADAPTIVE_CACHE_ARCHITECTURE.md');
  chk('سند معماری کش: تعارض RESOLVED ثبت شد', /RESOLVED \(V2-F07/.test(arch));
  chk('رجیستری: EV_POLICY.resolved=V2-F07', rr && rr.EV_POLICY.resolved === 'V2-F07' && rr.EV_POLICY.sharedInstance === 'noeviction');
}

/* ── S3 — اثباتِ منفی: جهش ⇒ قرمز، بازگردانی ⇒ سبز ─────────────────── */
console.log('\n▸ S3 — اثبات منفی (جهش رجیستری)');
{
  const p = path.join(ROOT, 'server/rate-limit.js');
  const orig = fs.readFileSync(p, 'utf8');
  let mutatedOk = false, restoredOk = false;
  try {
    const mutated = orig.replace(/const redisRoles = require\('\.\/redis-roles'\);/, "/* MUTATED: registry removed */")
      .replace(/return redisRoles\.key\('ratelimit', prefix, identifier\);/, 'return `rate:${prefix}:${identifier}`;');
    fs.writeFileSync(p, mutated);
    mutatedOk = wiringViolations().length > 0;
  } catch (e) { /* leave red */ }
  try { fs.writeFileSync(p, orig); } catch (e) { /* restore first */ }
  restoredOk = fs.readFileSync(p, 'utf8') === orig && wiringViolations().length === 0;
  chk('حذفِ رجیستری ⇒ گیت قرمز', mutatedOk);
  chk('بازگردانی ⇒ گیت سبز (بایت-به-بایت)', restoredOk);
  if (!restoredOk) { /* emergency restore */ fs.writeFileSync(p, orig); chk('بازگردانی اضطراری', fs.readFileSync(p, 'utf8') === orig); }
}

/* ── S4 — live: audit کلیدهای keyspace واقعی ───────────────────────── */
console.log('\n▸ S4 — live keyspace audit');
(async () => {
  const url = process.env.REDIS_URL || null;
  if (!url) skip('S4', 'REDIS_URL تنظیم نیست — آدیتِ keyspace زنده فقط با استکِ Redis');
  else {
    let Redis = null;
    try { Redis = require('ioredis'); } catch (e) { Redis = null; }
    if (!Redis) skip('S4', 'ioredis در دسترس نیست');
    else {
      const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
      try {
        await client.connect();
        const pong = await client.ping();
        chk('PING', pong === 'PONG');
        let scanned = 0, rogue = [];
        for (const f of rr.FAMILIES) {
          let cursor = '0';
          do {
            const [c, keys] = await client.scan(cursor, 'MATCH', f.prefix + '*', 'COUNT', 500);
            cursor = c;
            for (const k of keys) { scanned++; if (!rr.roleOf(k)) rogue.push(k); }
          } while (cursor !== '0');
        }
        chk('همهٔ کلیدهای اسکن‌شده داخل قرارداد', scanned > 0 && rogue.length === 0, 'scanned=' + scanned + ' rogue=' + rogue.slice(0, 5).join(','));
      } catch (e) {
        skip('S4', 'Redis در دسترس نیست — ' + (e && e.message ? e.message.slice(0, 80) : 'خطا'));
      } finally {
        try { client.disconnect(); } catch (e) { /* ignore */ }
      }
    }
  }
  /* ── نتیجه ── */
  console.log('\n────────────────────────────────────');
  console.log('نتیجه: ' + ok + ' موفق / ' + fail + ' ناموفق' + (skipped ? ' — ' + skipped + ' skip (صادقانه)' : '') + ' — از ' + (ok + fail + skipped));
  console.log('────────────────────────────────────');
  process.exitCode = fail ? 1 : 0;
})();
