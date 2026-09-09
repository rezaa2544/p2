#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/redis-metrics.js — جمع‌آور متریک‌های ردیس برای پایش (صفر وابستگی)
   ───────────────────────────────────────────────────────────────────
   خروجی، قالبِ متنیِ پرومتئوس است:
     - یک‌بار:  node tools/redis-metrics.js
     - سرویس:  node tools/redis-metrics.js --serve 9122
       (پرومتئوس این نشانی را اسکریپ می‌کند: /metrics)
   متریک‌های بومیِ ردیس از INFO خوانده می‌شوند؛ در درایور حافظه،
   معادل‌های مصنوعی تولید می‌شود تا توسعه هم پایش‌پذیر باشد.
   برای متریک‌های کامل‌ترِ عملیاتی، `redis_exporter` رسمی توصیه می‌شود
   (نگاه کنید به docs/REDIS_MONITORING_ALERTING.md).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const path = require('path');

/**
 * Parse raw Redis INFO text into a flat map.
 * @param {string} raw
 * @returns {Object<string,string>}
 */
function parseInfo(raw) {
  const out = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0 || line[0] === '#') continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/**
 * Collect all payesh redis metrics.
 * @param {object} redis — server/redis driver
 * @returns {Promise<Array<{name:string, help:string, type:string, value:number, labels?:Object}>>}
 */
async function collect(redis) {
  const m = [];
  const push = (name, help, type, value, labels) => {
    m.push({ name, help, type, value: Number(value) || 0, labels: labels || null });
  };

  /* لایو بودن + حالت */
  const p = await redis.ping();
  push('payesh_redis_up', 'Whether the payesh redis layer is reachable (1) or not (0)', 'gauge', p && p.ok ? 1 : 0);
  const mode = typeof redis.getMode === 'function' ? redis.getMode() : 'unknown';
  push('payesh_redis_mode', 'Driver mode (value is always 1; mode in label)', 'gauge', 1, { mode });

  if (!(p && p.ok)) return m; /* بقیهٔ متریک‌ها بدون اتصال معنا ندارند */

  /* شمار کلیدها */
  try {
    const keys = await redis.scan();
    push('payesh_redis_keys_total', 'Total number of keys currently held', 'gauge', keys.length);
    if (process.env.PAYESH_METRICS_KEYS === 'full') {
      let noTtl = 0;
      const cap = Math.min(keys.length, 2000); /* سقف برای اسکریپ‌های پیاپی */
      for (let i = 0; i < cap; i++) {
        const t = await redis.ttl(keys[i]);
        if (t === -1) noTtl++;
      }
      push('payesh_redis_keys_no_ttl', 'Keys without expiry (audit warning when > allowed-persistent set)', 'gauge', noTtl);
    }
  } catch (e) {}

  /* متریک‌های بومی ردیس از INFO */
  let infoMap = {};
  try { infoMap = parseInfo(await redis.info()); } catch (e) {}
  const num = (k, d) => { const v = Number(infoMap[k]); return Number.isFinite(v) ? v : d; };

  push('redis_used_memory_bytes', 'Total allocated memory (used_memory)', 'gauge', num('used_memory', 0));
  push('redis_used_memory_peak_bytes', 'Peak used memory (used_memory_peak)', 'gauge', num('used_memory_peak', 0));
  push('redis_connected_clients', 'Number of connected clients', 'gauge', num('connected_clients', 0));
  push('redis_blocked_clients', 'Number of blocked clients (BLPOP & co)', 'gauge', num('blocked_clients', 0));
  push('redis_instantaneous_ops_per_sec', 'Operations per second (instantaneous)', 'gauge', num('instantaneous_ops_per_sec', 0));
  push('redis_uptime_seconds', 'Server uptime in seconds', 'gauge', num('uptime_in_seconds', 0));

  const hits = num('keyspace_hits', 0);
  const misses = num('keyspace_misses', 0);
  const total = hits + misses;
  push('redis_hit_rate_percent', 'Cache hit rate: hits / (hits + misses) * 100', 'gauge',
    total > 0 ? (hits / total) * 100 : 100);

  /* تأخیر کپی‌سازی: برای کپی، عمرِ آخرین تماس با مستر جایگزینِ مناسبی است */
  const isReplica = infoMap.role === 'slave' || infoMap.role === 'replica';
  push('redis_repl_lag_seconds', 'Replication lag proxy (master_last_io_seconds_ago on replicas, else 0)', 'gauge',
    isReplica ? num('master_last_io_seconds_ago', 0) : 0);
  push('redis_role_replica', '1 if this node is a replica, 0 if master', 'gauge', isReplica ? 1 : 0);
  if (infoMap.master_link_status) {
    push('redis_master_link_up', 'Replica link to master (1 = up)', 'gauge', infoMap.master_link_status === 'up' ? 1 : 0);
  }

  return m;
}

/**
 * Render metrics into Prometheus text exposition format.
 * @param {Array} metrics
 */
function renderText(metrics) {
  const lines = [];
  const seen = new Set();
  for (const m of metrics) {
    if (!seen.has(m.name)) {
      lines.push('# HELP ' + m.name + ' ' + m.help);
      lines.push('# TYPE ' + m.name + ' ' + m.type);
      seen.add(m.name);
    }
    let labelStr = '';
    if (m.labels) {
      labelStr = '{' + Object.keys(m.labels).map(k => k + '="' + String(m.labels[k]).replace(/"/g, '\\"') + '"').join(',') + '}';
    }
    lines.push(m.name + labelStr + ' ' + m.value);
  }
  return lines.join('\n') + '\n';
}

/* ── CLI ──────────────────────────────────────────────────────────── */
if (require.main === module) {
  const redis = require(path.join(__dirname, '..', 'server', 'redis.js'));
  const serveIdx = process.argv.indexOf('--serve');
  const port = serveIdx !== -1 ? Number(process.argv[serveIdx + 1] || 9122) : 0;

  redis.init().then(async (r) => {
    if (!r || r.ok === false) {
      console.error('redis.init شکست خورد:', r && r.error);
      process.exit(1);
    }

    if (!port) {
      const text = renderText(await collect(redis));
      process.stdout.write(text);
      try { await redis.close(); } catch (e) {}
      process.exit(0);
    }

    /* حالت سرویس: /metrics برای پرومتئوس */
    const server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        try {
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
          res.end(renderText(await collect(redis)));
        } catch (e) {
          res.writeHead(500); res.end('error: ' + e.message);
        }
      } else if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404); res.end();
      }
    });
    server.listen(port, process.env.HOST || '0.0.0.0', () => {
      console.log('[redis-metrics] /metrics روی پورت ' + port + ' آمادهٔ اسکریپ است');
    });
    process.on('SIGTERM', () => { try { server.close(); } catch (e) {} process.exit(0); });
    process.on('SIGINT', () => { try { server.close(); } catch (e) {} process.exit(0); });
  }).catch((e) => { console.error('خطا:', e.message); process.exit(1); });
}

module.exports = { parseInfo, collect, renderText };
