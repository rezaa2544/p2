'use strict';
/* tests/m15-07-redis-tls.js — M15-07: قراردادِ TLSِ صف (ردیف ۲۶ صف).
   ───────────────────────────────────────────────────────────────────
   واقعیتِ زمین: صفِ محصول = Redis (outbox/worker/pub-sub) — RabbitMQ در
   کد وجود ندارد. TLSِ standalone از قبل با `rediss://` (native ioredis)؛
   این suite قراردادِ REDIS_TLS=1 را برای هر سه حالت می‌بندد:
     T1 بدونِ پرچم = بدونِ tls (رفتارِ پیشین، هر سه حالت)
     T2 sentinel: options.tls + sentinelOptions.tls
     T3 cluster: clusterOptions.redisOptions.tls
     T4 standalone با redis:// + پرچم = options.tls
     T5 CA: مسیرِ معتبر = بارگذاری؛ مسیرِ نامعتبر = بدونِ crash (fail-closed
        در اتصالِ واقعی با rejectUnauthorized پیش‌فرض)
     T6 اثباتِ منفیِ سیم‌کشی: برداشتنِ تزریقِ tls ⇒ قرمز
   Run: node tests/m15-07-redis-tls.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const redis = require('../server/redis.js');

let ok = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function cfg(envPatch) {
  const env = Object.assign({}, process.env, envPatch);
  delete env.REDIS_URL; delete env.REDIS_SENTINELS; delete env.REDIS_CLUSTER_NODES; delete env.REDIS_TLS; delete env.REDIS_TLS_CA;
  return redis.buildRedisConfig(Object.assign({}, env, envPatch));
}

const SENT = { REDIS_SENTINELS: '10.0.0.1:26379,10.0.0.2:26379', REDIS_SENTINEL_NAME: 'mymaster' };
const CLU = { REDIS_CLUSTER_NODES: '10.0.0.1:7000,10.0.0.2:7001' };

(async () => {
  console.log('\n▸ M15-07 — قراردادِ TLSِ صفِ Redis');

  /* T1 — بدونِ پرچم: هیچ tlsای (رفتارِ پیشین) */
  chk('T1a بدونِ پرچم، sentinel = بدونِ tls', !cfg(SENT).options.tls && !cfg(SENT).sentinelOptions.tls);
  chk('T1b بدونِ پرچم، cluster = بدونِ tls', !cfg(CLU).clusterOptions.redisOptions.tls);
  chk('T1c بدونِ پرچم، standalone = بدونِ tls', !cfg({ REDIS_URL: 'redis://h:1' }).options.tls);
  chk('T1d rediss:// از قبل رمز است (خودِ URL)', cfg({ REDIS_URL: 'rediss://h:1' }).mode === 'standalone');

  /* T2 — sentinel */
  const s = cfg(Object.assign({ REDIS_TLS: '1' }, SENT));
  chk('T2a sentinel: options.tls فعال', !!s.options.tls && typeof s.options.tls === 'object');
  chk('T2b sentinel: sentinelOptions.tls فعال', !!s.sentinelOptions.tls);

  /* T3 — cluster */
  const c = cfg(Object.assign({ REDIS_TLS: 'true' }, CLU));
  chk('T3 cluster: redisOptions.tls فعال', !!c.clusterOptions.redisOptions.tls);

  /* T4 — standalone با پرچم */
  const st = cfg({ REDIS_TLS: '1', REDIS_URL: 'redis://h:1' });
  chk('T4 standalone: options.tls فعال', !!st.options.tls);

  /* T5 — CA */
  const tmpCa = path.join(os.tmpdir(), 'payesh-test-ca-' + Date.now() + '.pem');
  fs.writeFileSync(tmpCa, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n');
  const withCa = cfg(Object.assign({ REDIS_TLS: '1', REDIS_TLS_CA: tmpCa }, SENT));
  chk('T5a CA معتبر = بارگذاری شد', Array.isArray(withCa.options.tls.ca) && withCa.options.tls.ca.length === 1);
  fs.unlinkSync(tmpCa);
  const badCa = cfg(Object.assign({ REDIS_TLS: '1', REDIS_TLS_CA: '/nonexistent/ca.pem' }, SENT));
  chk('T5b CA ناموجود = بدونِ crash، tls سالم', !!badCa.options.tls && !badCa.options.tls.ca);

  /* T6 — اثباتِ منفیِ سیم‌کشی: منبعِ واقعی باید tls را تزریق کند */
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'redis.js'), 'utf8');
  const wired = src.includes('tls ? { tls } : {}') && src.includes("env.REDIS_TLS === '1'");
  chk('T6 سیم‌کشیِ tls در منبع موجود است (حذفش = قرمزِ این تست)', wired);

  console.log('────────────────────────────────────────────');
  console.log('m15-07-redis-tls: ' + ok + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (ok + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e && e.message)); process.exit(1); });
