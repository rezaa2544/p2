#!/usr/bin/env node
/* رگرسیون W11-3 (باگ‌هانت چت ۵، نشست ۳، موج ۱۱): وفاداریِ TTL در فال‌بکِ حافظه.
   ─────────────────────────────────────────────────────────────
   مسیرِ حافظه‌ایِ redis.set دو واگرایی از معنایِ واقعیِ ردیس داشت:
   (۱) بازنویسیِ بی‌TTL انقضایِ قبلی را پاک نمی‌کرد (ردیسِ واقعی: SET بی‌EX
   کلید را ماندگار می‌کند) — کلید زودتر از انتظار ناپدید می‌شد؛
   (۲) مدتِ رشته‌ایِ عددی ('60') نادیده گرفته می‌شد (ioredis می‌پذیرد) —
   کلید به‌جایِ انقضادار، ماندگار می‌ماند. هر دو مستقیم اثبات‌شدنی‌اند.
   اجرا: node tests/redis-mem-ttl.js (حافظه، بدونِ ردیس/پورت) */
'use strict';
const redis = require('../server/redis.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n▸ W11-3 — فال‌بکِ حافظه مثلِ ردیس TTL را می‌فهمد');
  if (redis.isRedis()) { console.log('  ردیسِ واقعی وصل است — این تست مخصوصِ حالتِ حافظه است'); process.exit(2); }

  /* ── ۱) بازنویسیِ بی‌TTL انقضایِ قبلی را پاک می‌کند ── */
  await redis.set('w11:k1', 'v1', 'EX', 1);
  await redis.set('w11:k1', 'v2');
  chk('M1 پس از بازنویسیِ بی‌TTL، ماندگار است (ttl=-1)', (await redis.ttl('w11:k1')) === -1,
    'ttl=' + (await redis.ttl('w11:k1')));
  await sleep(1100); /* گذر از مهلتِ اولیه */
  chk('M2 پس از مهلتِ اولیه هنوز خوانده می‌شود', (await redis.get('w11:k1')) === 'v2',
    'get=' + (await redis.get('w11:k1')));
  await redis.del('w11:k1');

  /* ── ۲) مدتِ رشته‌ایِ عددی پذیرفته می‌شود ── */
  await redis.set('w11:k2', 'v', 'EX', '1');
  const t2 = await redis.ttl('w11:k2');
  chk("M3 مدتِ '1' انقضا گذاشت (ttl در ۰..۱)", t2 >= 0 && t2 <= 1, 'ttl=' + t2);
  await redis.del('w11:k2');

  /* ── ۳) پینِ رفتارِ درستِ موجود ── */
  await redis.set('w11:k3', 'v');
  chk('M4 نوشتنِ بی‌TTL از اول ماندگار است', (await redis.ttl('w11:k3')) === -1);
  await redis.set('w11:k3', 'v2', 'EX', 100);
  const t3 = await redis.ttl('w11:k3');
  chk('M5 بازنویسیِ EXدار انقضایِ تازه گذاشت', t3 > 90 && t3 <= 100, 'ttl=' + t3);
  await redis.del('w11:k3');

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
