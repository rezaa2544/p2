#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جمع‌آور متریک ردیس (tools/redis-metrics.js)
   ۱) پارسِ INFO (سطرها، سرفصل‌ها، القای خالی)
   ۲) جمع‌آوری در درایور حافظه: لایو بودن، حالت، شمار کلید
   ۳) متریک‌های محاسبه‌ای: نرخ اصابت، حافظه
   ۴) ممیزی بی‌TTL در حالت کامل
   ۵) قالب متنی پرومتئوس (HELP/TYPE/برچسب)
   ۶) اجرای بالینی ابزار با خروجی صفر
   اجرا:  node tests/redis-metrics.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const cp = require('child_process');

delete process.env.NODE_ENV;
delete process.env.REDIS_URL;

const ROOT = path.join(__dirname, '..');
const redis = require(path.join(ROOT, 'server', 'redis.js'));
const { parseInfo, collect, renderText } = require(path.join(ROOT, 'tools', 'redis-metrics.js'));

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const find = (ms, name) => ms.filter(m => m.name === name);

async function main() {
  console.log('▸ متریک‌های ردیس');
  const r = await redis.init();
  if (!r || r.ok === false) { console.log('  ❌ redis.init شکست خورد'); process.exit(1); }

  // ۱) پارس INFO
  {
    const raw = '# Server\r\nredis_version:7.2.0\r\nuptime_in_seconds:123\r\n\r\n# Clients\r\nconnected_clients:9\r\n# bad:line\r\n';
    const info = parseInfo(raw);
    chk('پرسش نسخه و آپ‌تایم', info.redis_version === '7.2.0' && info.uptime_in_seconds === '123');
    chk('سرفصل‌ها و خطوط خالی رد می‌شوند', !('# Server' in info) && !('# bad' in info));
    chk('القای خالی → شیء خالی', Object.keys(parseInfo('')).length === 0);
  }

  // ۲+۳) جمع‌آوری در درایور حافظه
  {
    await redis.set('payesh:cache:bootstrap:1', '{"a":1}', 'EX', 300);
    await redis.set('payesh:otp:state', '{"v":1}'); /* بدون انقضا */
    const ms = await collect(redis);
    const up = find(ms, 'payesh_redis_up')[0];
    const mode = find(ms, 'payesh_redis_mode')[0];
    const keys = find(ms, 'payesh_redis_keys_total')[0];
    const hit = find(ms, 'redis_hit_rate_percent')[0];
    const mem = find(ms, 'redis_used_memory_bytes')[0];
    const uptime = find(ms, 'redis_uptime_seconds')[0];
    chk('لایو بودن گزارش می‌شود', !!up && up.value === 1);
    chk('برچسب حالت دارد', !!mode && mode.labels && mode.labels.mode === 'memory');
    chk('شمار کلیدها دقیق است', !!keys && keys.value === 2, 'got=' + (keys && keys.value));
    chk('نرخ اصابت بدون ترافیک ۱۰۰ است', !!hit && hit.value === 100);
    chk('حافظه و آپ‌تایم عدد دارند', !!mem && mem.value >= 0 && !!uptime && uptime.value >= 0);
  }

  // ۴) ممیزی بی‌TTL در حالت کامل
  {
    process.env.PAYESH_METRICS_KEYS = 'full';
    const ms = await collect(redis);
    delete process.env.PAYESH_METRICS_KEYS;
    const noTtl = find(ms, 'payesh_redis_keys_no_ttl')[0];
    chk('کلیدهای بی‌انقضا شمرده می‌شوند', !!noTtl && noTtl.value === 1, 'got=' + (noTtl && noTtl.value));
  }

  // ۵) قالب متنی پرومتئوس
  {
    const ms = await collect(redis);
    const text = renderText(ms);
    chk('خطوط HELP و TYPE دارد', text.indexOf('# HELP payesh_redis_up') !== -1 && text.indexOf('# TYPE payesh_redis_up gauge') !== -1);
    chk('برچسب‌ها درست قالب‌گیری می‌شوند', /payesh_redis_mode\{mode="memory"\} 1/.test(text), text.slice(0, 200));
    chk('مقدار لایو در متن هست', /payesh_redis_up 1/.test(text));
    /* نام متریک‌ها تکراری چاپ نمی‌شود */
    const helps = text.match(/# HELP payesh_redis_up/g) || [];
    chk('سرآیند هر متریک یک‌بار می‌آید', helps.length === 1);
  }

  // ۶) اجرای بالینی ابزار
  {
    const out = cp.spawnSync(process.execPath, ['tools/redis-metrics.js'], { cwd: ROOT, env: process.env, encoding: 'utf8' });
    chk('اجرای بالینی با خروجی صفر', out.status === 0, (out.stderr || '').slice(0, 150));
    chk('خروجی شامل متریک لایو بودن است', (out.stdout || '').indexOf('payesh_redis_up 1') !== -1);
  }

  await redis.close();
  console.log(`\nredis-metrics: ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
