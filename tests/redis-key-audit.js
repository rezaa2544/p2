#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   ممیزی کلیدهای Redis و TTL — تست
   ۱) طبقه‌بندی الگوهای شناخته‌شده
   ۲) شمارندهٔ اتمیک با تضمین انقضا (incrWithTtl)
   ۳) خوددرمانی کلید یتیم (بازمانده از کرش)
   ۴) ممیزی: پرچمِ بی‌انقضای غیرمجاز + ناشناخته‌ها
   ۵) دائمیِ مجاز (payesh:otp:state) پرچم نمی‌خورد
   اجرا:  node tests/redis-key-audit.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

delete process.env.NODE_ENV;
delete process.env.REDIS_URL;

const ROOT = path.join(__dirname, '..');
const redis = require(path.join(ROOT, 'server', 'redis.js'));
const cache = require(path.join(ROOT, 'server', 'cache.js'));
const rateLimit = require(path.join(ROOT, 'server', 'rate-limit.js'));
const { classifyKey, audit } = require(path.join(ROOT, 'tools', 'redis-audit.js'));

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  console.log('▸ ممیزی کلیدهای Redis و TTL');
  const r = await redis.init();
  if (!r || r.ok === false) { console.log('  ❌ redis.init شکست خورد'); process.exit(1); }

  // ۱) طبقه‌بندی
  {
    chk('کلید بوت‌استرپ شناخته می‌شود', !!(classifyKey('payesh:cache:bootstrap:7')));
    chk('کلید قفل شناخته می‌شود', !!(classifyKey('payesh:lock:otp-state')));
    chk('کلید شمارنده شناخته می‌شود', !!(classifyKey('rate:otp:login:ip:1.2.3.4')));
    chk('حالت ورود دائمیِ مجاز است', classifyKey('payesh:otp:state') && classifyKey('payesh:otp:state').expectTtl === false);
    chk('کلید ناشناخته تهی برمی‌گردد', classifyKey('mystery:key') === null);
  }

  // ۲) incrWithTtl — شمارش + تضمین انقضا
  {
    const v1 = await redis.incrWithTtl('rate:test:a', 900);
    const v2 = await redis.incrWithTtl('rate:test:a', 900);
    const t = await redis.ttl('rate:test:a');
    chk('شمارش درست بالا می‌رود', v1 === 1 && v2 === 2, `v1=${v1} v2=${v2}`);
    chk('انقضا از همان نوشتِ نخست هست', t > 0 && t <= 900, `ttl=${t}`);
  }

  // ۳) خوددرمانی کلید یتیم
  {
    /* شبیه‌سازی کرش: اینکریمِنت شد ولی اکسپایر هرگز نرسید */
    await redis.incr('rate:orphan:1');
    const before = await redis.ttl('rate:orphan:1');
    chk('کلید یتیم بی‌انقضا مانده', before === -1, `ttl=${before}`);
    const v = await redis.incrWithTtl('rate:orphan:1', 900);
    const after = await redis.ttl('rate:orphan:1');
    chk('اولین برخورد بعدی انقضا می‌دهد', v === 2 && after > 0, `v=${v} ttl=${after}`);
  }

  // ۴+۵) ممیزی کامل
  {
    await redis.set('payesh:cache:bootstrap:1', '{}', 'EX', 300);
    await redis.set('payesh:lock:demo', 'tok', 'EX', 5);
    await redis.set('payesh:otp:state', JSON.stringify({ v: 1, seq: 1, codes: {}, cd: {}, login_fail: {}, tomb: {} }));
    await redis.incr('rate:orphan:2');           /* یتیمِ تازه — باید پرچم بخورد */
    await redis.set('mystery:key', 'x', 'EX', 60); /* ناشناخته */

    const res = await audit(redis);
    const orphanRow = res.rows.find(x => x.key === 'rate:orphan:2');
    const mysteryRow = res.rows.find(x => x.key === 'mystery:key');
    const otpRow = res.rows.find(x => x.key === 'payesh:otp:state');
    chk('یتیمِ بی‌انقضا پرچم می‌خورد', !!(orphanRow && orphanRow.problem === 'no-ttl'));
    chk('کلید ناشناخته پرچم می‌خورد', !!(mysteryRow && mysteryRow.problem === 'unknown'));
    chk('دائمیِ مجاز پرچم نمی‌خورد', !!(otpRow && otpRow.problem === null && otpRow.ttl === -1));
    chk('فهرست یتیم‌ها دقیق است', res.orphaned.length === 1 && res.orphaned[0] === 'rate:orphan:2', JSON.stringify(res.orphaned));
    chk('فهرست ناشناخته‌ها دقیق است', res.unknown.length === 1 && res.unknown[0] === 'mystery:key', JSON.stringify(res.unknown));
    chk('خلاصه ناسالم گزارش می‌شود', res.okSummary === false);

    /* پس از خوددرمانی، ممیزی دوباره باید یتیم را نبیند */
    await redis.incrWithTtl('rate:orphan:2', 900);
    await redis.del('mystery:key');
    const res2 = await audit(redis);
    chk('پس از خوددرمانی، وضعیت سالم است', res2.okSummary === true, `orphaned=${JSON.stringify(res2.orphaned)} unknown=${JSON.stringify(res2.unknown)}`);
  }

  // رفتار محدودسازی نرخ پس از تغییر، دست‌نخورده
  {
    const id = 'audit-rl-' + Date.now();
    let allowedCount = 0;
    for (let i = 0; i < 5; i++) {
      const res = await rateLimit.checkRateLimit({ prefix: 'audit:t', identifier: id, limit: 3, windowSeconds: 60 });
      if (res.allowed) allowedCount++;
    }
    chk('سقف نرخ همچنان اعمال می‌شود', allowedCount === 3, `allowed=${allowedCount}`);
  }

  // ۶) مسیرهای ابطال کش (C4-03 — الف: ایندکس مدرسه، ب: epoch/pubsub، پ: انضباط تک‌کلیدی)
  {
    await cache.init();
    const sid = 42;
    const uidA = 4201, uidB = 4202;

    await cache.setBootstrapCache(uidA, { school: { id: sid }, name: 'StudentA' }, 300);
    await cache.setBootstrapCache(uidB, { school: { id: sid }, name: 'StudentB' }, 300);

    const schoolSetKey = `payesh:cache:school:${sid}`;
    const initialMembers = await redis.sMembers(schoolSetKey);
    const initialA = await redis.get(`payesh:cache:bootstrap:${uidA}`);
    const initialB = await redis.get(`payesh:cache:bootstrap:${uidB}`);

    chk('ورودی‌های اولیه در L2 و ستِ ایندکس مدرسه حاضرند',
      initialMembers.length === 2 && initialMembers.includes(String(uidA)) && initialMembers.includes(String(uidB)) && !!initialA && !!initialB,
      `members=${JSON.stringify(initialMembers)}`);

    // جاسوسی بر انضباط تک‌کلیدی (Single-key discipline) و کانال ابطال
    const recordedDelKeyCounts = [];
    let sRemTouchedKey = null;
    let pubsubPayload = null;

    const origDel = redis.del.bind(redis);
    const origSRem = redis.sRem.bind(redis);
    const origPublish = redis.publish.bind(redis);

    redis.del = async function(...args) {
      recordedDelKeyCounts.push(args.length);
      return origDel(...args);
    };
    redis.sRem = async function(key, ...members) {
      sRemTouchedKey = key;
      return origSRem(key, ...members);
    };
    redis.publish = async function(channel, msg) {
      pubsubPayload = { channel, msg };
      return origPublish(channel, msg);
    };

    // اجرای ابطال مدرسه
    await cache.invalidateSchool(sid);

    // بازگردانی توابع
    redis.del = origDel;
    redis.sRem = origSRem;
    redis.publish = origPublish;

    const afterMembers = await redis.sMembers(schoolSetKey);
    const afterA = await redis.get(`payesh:cache:bootstrap:${uidA}`);
    const afterB = await redis.get(`payesh:cache:bootstrap:${uidB}`);
    const schoolEpoch = await redis.get(`payesh:cache:epoch:school:${sid}`);

    // الف) ابطال ایندکس مدرسه: پاک شدن کلیدهای L2 و تخلیه عضویت ست
    chk('ابطال ایندکس مدرسه: کلیدهای bootstrap کاربران از L2 پاک شدند', afterA === null && afterB === null, `afterA=${afterA} afterB=${afterB}`);
    chk('ابطال ایندکس مدرسه: اعضای ست مدرسه کاملاً تخلیه شدند (توقف رشد بی‌کران)', afterMembers.length === 0, `remaining=${JSON.stringify(afterMembers)}`);

    // ب) ابطال epoch و انتشار پیام Pub/Sub
    chk('ابطال epoch مدرسه: کلید epoch تازه مقداردهی شد', typeof schoolEpoch === 'string' && schoolEpoch.length > 0, `epoch=${schoolEpoch}`);
    chk('انتشار رویداد ابطال روی کانال Pub/Sub payesh:pubsub:inval',
      pubsubPayload && pubsubPayload.channel === 'payesh:pubsub:inval' && pubsubPayload.msg && pubsubPayload.msg.type === 'school' && pubsubPayload.msg.school_id === sid,
      `pubsub=${JSON.stringify(pubsubPayload)}`);

    // پ) انضباط تک‌کلیدی برای ایمنی کلاستر: عدم استفاده از del چندکلیدی و اجرای sRem تک‌کلیدی
    const allDelsSingleKey = recordedDelKeyCounts.length === 2 && recordedDelKeyCounts.every(cnt => cnt === 1);
    chk('انضباط ایمنی کلاستر: همه فراخوانی‌های DEL تک‌کلیدی بودند (بدون cross-slot DEL)',
      allDelsSingleKey, `delCounts=${JSON.stringify(recordedDelKeyCounts)}`);
    chk('انضباط ایمنی کلاستر: عملیات sRem بر روی تک‌کلید ایندکس مدرسه بود',
      sRemTouchedKey === schoolSetKey, `sRemKey=${sRemTouchedKey}`);
  }

  await redis.close();
  console.log(`\nredis-key-audit: ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
