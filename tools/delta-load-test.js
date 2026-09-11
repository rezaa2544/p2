#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/delta-load-test.js — Delta-under-load harness (Delta Hardening Phase 2, gap 3)
   ─────────────────────────────────────────────────────────────────
   Measures what a burst of parallel delta pulls does to the delta read
   path (server/syncdelta.js builders → PostgreSQL).

   Modes
   ── DRY_RUN (default) ─────────────────────────────────────────────
   No database touched. Validates the harness itself: request plan,
   SQL builders, result accounting — against an in-process fake DB.
   ⚠️ DRY_RUN latencies are SIMULATED harness overhead, NOT a performance
   measurement of PostgreSQL. Never quote them as p50/p95/p99.

   ── --live ────────────────────────────────────────────────────────
   Requires DATABASE_URL (or --database-url). Issues N (default 1000)
   delta queries through the REAL production builders with real binds,
   at the chosen concurrency (default 1000 — full parallel burst), and
   reports p50/p95/p99/max latency, throughput, error rate, and pg pool
   metrics (total/idle/waiting sampled at 50ms, peaks reported).

   Usage
     node tools/delta-load-test.js                     # DRY_RUN
     node tools/delta-load-test.js --live              # needs DATABASE_URL
     node tools/delta-load-test.js --live -n 1000 -c 200 --out report.json

   Safety: SELECT-only (the delta builders are pure reads). Point it at a
   replica or a staging DB — never a production primary.
   Exit code: 0 = all requests succeeded; 1 = configuration/usage error;
   2 = ran but ≥1 request failed (see --max-error-rate).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { deltaRowsSql } = require('../server/syncdelta');

/* ── CLI ──────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const a = { live: false, n: 1000, concurrency: 1000, collections: null, sinceMinutes: 5, out: null, maxErrorRate: 0 };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--live') a.live = true;
    else if (t === '--dry-run') a.live = false;
    else if (t === '-n' || t === '--requests') a.n = Number(argv[++i]);
    else if (t === '-c' || t === '--concurrency') a.concurrency = Number(argv[++i]);
    else if (t === '--collections') a.collections = String(argv[++i]).split(',').map(s => s.trim()).filter(Boolean);
    else if (t === '--since-minutes') a.sinceMinutes = Number(argv[++i]);
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--database-url') process.env.DATABASE_URL = argv[++i];
    else if (t === '--max-error-rate') a.maxErrorRate = Number(argv[++i]);
    else if (t === '-h' || t === '--help') { usage(); process.exit(0); }
    else { console.error('آرگومان ناشناخته: ' + t); usage(); process.exit(1); }
  }
  return a;
}
function usage() {
  console.log('delta-load-test — ابزارِ بارِ دلتا (gap 3, Delta Hardening Phase 2)\n' +
    '  node tools/delta-load-test.js [--live] [-n N] [-c C] [--collections a,b]\n' +
    '      [--since-minutes M] [--out file.json] [--database-url URL] [--max-error-rate R]\n' +
    'پیش‌فرض: DRY_RUN (بدون دیتابیس — فقط صحت‌سنجی هارنس؛ اعدادش سنجهٔ عملکرد نیستند).');
}

/* ── shared plan ──────────────────────────────────────────────────── */
const ALL_COLLECTIONS = [
  'schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments',
  'attendance', 'grades', 'discipline', 'leaves', 'notifications',
  'announcements', 'homework', 'hw_submissions', 'vclass_rooms',
  'bell_schedules', 'sync_conflicts', 'counselor_refs', 'counselor_msgs'
];

function buildPlan(args) {
  const cols = (args.collections && args.collections.length) ? args.collections : ALL_COLLECTIONS;
  for (const c of cols) {
    deltaRowsSql(c, { sinceISO: '2000-01-01T00:00:00.000Z' }); /* allowlist check up-front */
  }
  const sinceISO = new Date(Date.now() - args.sinceMinutes * 60000).toISOString();
  const plan = [];
  for (let i = 0; i < args.n; i++) {
    const c = cols[i % cols.length];
    const built = deltaRowsSql(c, { sinceISO });
    plan.push({ i, collection: c, sql: built.sql, params: built.params });
  }
  return { cols, sinceISO, plan };
}

/* ── stats ────────────────────────────────────────────────────────── */
function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function summarize(latencies) {
  const s = latencies.slice().sort((a, b) => a - b);
  return {
    count: s.length,
    p50_ms: Math.round(pct(s, 50) * 1000 * 100) / 100,
    p95_ms: Math.round(pct(s, 95) * 1000 * 100) / 100,
    p99_ms: Math.round(pct(s, 99) * 1000 * 100) / 100,
    max_ms: Math.round(s[s.length - 1] * 1000 * 100) / 100
  };
}

/* ── DRY RUN (fake DB — validates the harness, NOT a perf measurement) ── */
async function dryRun(args) {
  const { cols, sinceISO, plan } = buildPlan(args);
  console.log('── DRY_RUN (بدون دیتابیس) ─────────────────────────────────');
  console.log(`درخواست‌ها: ${args.n} · کالکشن‌ها: ${cols.length} · since: ${sinceISO}`);
  console.log('⚠️  اعدادِ زیر سربارِ شبیه‌سازیِ هارنس‌اند، نه عملکردِ PostgreSQL.');

  /* fake DB: per-collection row counts; query() resolves after a 0-cost tick */
  const rowsByCol = {};
  for (const c of cols) rowsByCol[c] = [];
  const fakeDb = {
    async query(sql, params) {
      const m = /FROM "([a-z_]+)"/.exec(sql);
      const c = m ? m[1] : '';
      if (!/ORDER BY updated_at ASC, id ASC/.test(sql)) throw new Error('dry-run: stable order missing');
      if (!Array.isArray(params) || params.length < 1) throw new Error('dry-run: params missing');
      return { rows: rowsByCol[c] || [] };
    }
  };

  const lat = [];
  let errors = 0;
  const t0 = Date.now();
  let inflight = 0, peakInflight = 0;
  async function runOne(p) {
    inflight++; if (inflight > peakInflight) peakInflight = inflight;
    const s = process.hrtime.bigint();
    try { await fakeDb.query(p.sql, p.params); }
    catch (e) { errors++; }
    lat.push(Number(process.hrtime.bigint() - s) / 1e9);
    inflight--;
  }
  /* full-burst: all N promises at once (bounded by microtask scheduling) */
  await Promise.all(plan.map(runOne));
  const wall = (Date.now() - t0) / 1000;
  const sum = summarize(lat);
  console.log(`موفق: ${lat.length - errors}/${args.n} · خطا: ${errors}`);
  console.log(`سربار شبیه‌سازی: p50=${sum.p50_ms}ms p95=${sum.p95_ms}ms p99=${sum.p99_ms}ms max=${sum.max_ms}ms · wall=${wall.toFixed(3)}s`);
  console.log(`اوجِ هم‌زمانیِ شبیه‌شده: ${peakInflight}`);
  console.log('→ برای سنجهٔ واقعی (p50/p95/p99 + pool) حالتِ --live با DATABASE_URL را اجرا کنید.');
  return { mode: 'DRY_RUN', simulated: true, requests: args.n, errors, latency: sum, wall_s: wall, peak_concurrency: peakInflight };
}

/* ── LIVE (real PG through the production builders) ───────────────── */
async function liveRun(args) {
  let pg = null;
  try { pg = require('pg'); } catch (e) {
    console.error('پکیج pg نصب نیست (npm ci) — حالت live ممکن نیست.'); process.exit(1);
  }
  const cs = process.env.DATABASE_URL;
  if (!cs) { console.error('DATABASE_URL تنظیم نشده (یا --database-url بدهید).'); process.exit(1); }

  const { cols, sinceISO, plan } = buildPlan(args);
  const pool = new pg.Pool({
    connectionString: cs,
    max: Number(process.env.PG_POOL_MAX || 20),
    connectionTimeoutMillis: Number(process.env.PG_TIMEOUT_MS || 5000)
  });

  console.log('── LIVE (PostgreSQL واقعی) ────────────────────────────────');
  console.log(`درخواست‌ها: ${args.n} · هم‌زمانی: ${args.concurrency} · کالکشن‌ها: ${cols.length} · since: ${sinceISO} (-${args.sinceMinutes}m)`);
  console.log(`pool.max: ${pool.options.max}`);

  /* warm one connection so first-request TLS/handshake cost doesn't skew p99 */
  const wcli = await pool.connect();
  await wcli.query('SELECT 1');
  wcli.release();

  const lat = [];
  const errs = [];
  const fallbacks = [];   /* schema-unsupported collections (missing table/column):
                             in production pull.js these transparently fall back to
                             a full-table read — counted separately from hard errors */
  const poolSamples = [];
  let inflight = 0, peakInflight = 0;

  const sampler = setInterval(() => {
    poolSamples.push({ t: Date.now(), total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });
  }, 50);

  function classifyErr(msg) {
    if (/relation ".*" does not exist/i.test(msg)) return 'fallback';
    if (/column ".*" does not exist/i.test(msg)) return 'fallback';
    return 'hard';
  }

  const t0 = Date.now();
  let next = 0;
  async function worker() {
    for (;;) {
      const idx = next++;
      if (idx >= plan.length) return;
      const p = plan[idx];
      inflight++; if (inflight > peakInflight) peakInflight = inflight;
      const s = process.hrtime.bigint();
      try {
        const res = await pool.query(p.sql, p.params);
        if (!res || !Array.isArray(res.rows)) throw new Error('bad result shape');
        lat.push(Number(process.hrtime.bigint() - s) / 1e9);
      } catch (e) {
        lat.push(Number(process.hrtime.bigint() - s) / 1e9);
        const msg = String(e && e.message).slice(0, 200);
        const kind = classifyErr(msg);
        (kind === 'fallback' ? fallbacks : errs).push({ i: p.i, collection: p.collection, msg });
      }
      inflight--;
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(args.concurrency, plan.length); i++) workers.push(worker());
  await Promise.all(workers);
  const wall = (Date.now() - t0) / 1000;
  clearInterval(sampler);

  const sum = summarize(lat);
  const peak = (k) => poolSamples.reduce((m, s) => Math.max(m, s[k]), 0);
  const endPool = poolSamples.length ? poolSamples[poolSamples.length - 1] : { total: 0, idle: 0, waiting: 0 };
  const throughput = wall > 0 ? (lat.length / wall) : 0;
  const errorRate = lat.length ? errs.length / lat.length : 0;

  console.log('\nنتایج (هر درخواست = یک کوئریِ دلتای واقعی از builderهای تولیدی):');
  console.log(`  موفق: ${lat.length - errs.length - fallbacks.length}/${args.n} · خطای سخت: ${errs.length} (${(errorRate * 100).toFixed(2)}%)` +
    (fallbacks.length ? ` · شمولِ fallback-محور: ${fallbacks.length} (جدول/ستونِ غایب — pull.js به‌صورت شفاف full-read می‌کند)` : ''));
  console.log(`  تأخیر: p50=${sum.p50_ms}ms · p95=${sum.p95_ms}ms · p99=${sum.p99_ms}ms · max=${sum.max_ms}ms`);
  console.log(`  توانِ عملیاتی: ${throughput.toFixed(1)} req/s · wall: ${wall.toFixed(2)}s`);
  console.log(`  pool: max=${pool.options.max} · اوجِ total=${peak('total')} · اوجِ waiting=${peak('waiting')} · اوجِ idle=${peak('idle')} · پایان: total=${endPool.total} idle=${endPool.idle} waiting=${endPool.waiting}`);
  console.log(`  اوجِ هم‌زمانیِ مشاهده‌شده: ${peakInflight}`);
  if (fallbacks.length) {
    const byCol = {};
    for (const f of fallbacks) byCol[f.collection] = (byCol[f.collection] || 0) + 1;
    console.log('  شکافِ اسکیما (fallback): ' + Object.keys(byCol).map(k => `${k}×${byCol[k]}`).join(' · '));
  }
  if (errs.length) {
    console.log('  نمونه‌خطاها:');
    for (const e of errs.slice(0, 5)) console.log(`    #${e.i} [${e.collection}] ${e.msg}`);
  }

  await pool.end().catch(() => {});

  const report = {
    mode: 'LIVE', simulated: false, database: cs.replace(/:[^:@/]+@/, ':***@'),
    requests: args.n, concurrency: args.concurrency, since_minutes: args.sinceMinutes,
    collections: cols.length, pool_max: pool.options.max,
    ok: lat.length - errs.length - fallbacks.length,
    errors: errs.length, error_rate: errorRate,
    fallback_worthy: fallbacks.length,
    latency: sum, throughput_req_s: Math.round(throughput * 10) / 10, wall_s: Math.round(wall * 100) / 100,
    pool: { peak_total: peak('total'), peak_waiting: peak('waiting'), peak_idle: peak('idle'), end: endPool },
    peak_concurrency: peakInflight,
    error_samples: errs.slice(0, 20),
    fallback_samples: fallbacks.slice(0, 20)
  };
  if (errorRate > args.maxErrorRate) {
    console.error(`نرخ خطای سخت ${(errorRate * 100).toFixed(2)}% > آستانه ${(args.maxErrorRate * 100).toFixed(2)}% — EXIT 2`);
    process.exitCode = 2;
  }
  return report;
}

/* ── main ─────────────────────────────────────────────────────────── */
(async function main() {
  const args = parseArgs(process.argv);
  let report;
  if (args.live) report = await liveRun(args);
  else report = await dryRun(args);
  if (args.out) {
    const fs = require('fs');
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
    console.log(`گزارش JSON: ${args.out}`);
  }
})().catch((e) => { console.error('خطای داخلی:', e && e.message); process.exit(1); });
