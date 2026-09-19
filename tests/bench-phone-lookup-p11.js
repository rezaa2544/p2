#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   bench-phone-lookup-p11.js — P1-1: قبل/بعدِ جستجوی کاربرِ auth
   ─────────────────────────────────────────────────────────────────
   «قبل» = عینِ کدِ قبلیِ server/auth.js: find خطی روی آرایهٔ
   store.users (آینه) — شبیه‌سازی روی همان ۱M رکوردِ واقعیِ PG
   (بدترین حالت: کاربرِ هدف در انتهای آرایه).
   «بعد»  = کوئریِ ایندکسیِ userByPhone (010) روی همان داده.

   اجرا (PG زنده + DB خالی):
     P11_LIVE_PG='postgres://p11:p11@127.0.0.1:5432/payesh_bench' \
       node tests/bench-phone-lookup-p11.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const PGURL = process.env.P11_LIVE_PG || '';
let pg = null; try { pg = require('pg'); } catch(e) {}
if(!PGURL || !pg){ console.log('⏭ self-skip'); process.exit(1); }

const N = Number(process.env.P11_BENCH_N || 1000000);
const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];

(async function main(){
  const pool = new pg.Pool({ connectionString: PGURL, max: 4 });
  const t0 = Date.now();
  /* migrations */
  const migDir = path.join(__dirname, '..', 'migrations');
  for(const m of fs.readdirSync(migDir).filter(f => /^\d+_.+\.sql$/.test(f) && !/\.down\.sql$/.test(f)).sort()){
    await pool.query(fs.readFileSync(path.join(migDir, m), 'utf8'));
  }
  await pool.query(`INSERT INTO schools (id, version, active, created_at, updated_at)
    VALUES (1, 1, true, now(), now()) ON CONFLICT (id) DO NOTHING`);
  /* ۱M کاربر — تلفن‌های یکتا؛ هدف = id=N (انتهای آرایهٔ آینه = بدترین حالتِ find) */
  console.log('seed ' + N + ' users …');
  await pool.query(`
    INSERT INTO users (id, school_id, role, full_name, phone, national_id, active, created_at, updated_at)
    SELECT g, 1, 'student', 'کاربر ' || g,
           '0912' || lpad(g::text, 7, '0'),
           lpad(g::text, 10, '0'), true, now(), now()
    FROM generate_series(1, ${N}) g`);
  await pool.query('ANALYZE users');
  const seedMs = Date.now() - t0;
  console.log('seed+analyze: ' + (seedMs / 1000).toFixed(1) + 's');

  /* ── بعد: کوئریِ ایندکسی (userByPhone جدید) ── */
  const AUTH_SQL = 'SELECT id, role, school_id, national_id, active, full_name, phone ' +
    'FROM users WHERE right(regexp_replace(phone, $2, \'\', \'g\'), 10) = $1 ORDER BY id LIMIT 1';
  const ARGS = ['912' + String(N).padStart(7, '0'), '[\\s\\-()]'];
  /* warmup */
  const w = (await pool.query(AUTH_SQL, ARGS)).rows;
  if(w.length !== 1 || w[0].id !== N) throw new Error('هدف بنچ پیدا نشد: ' + JSON.stringify(w));
  const after = [];
  for(let i = 0; i < 300; i++){
    const s = process.hrtime.bigint();
    const r = (await pool.query(AUTH_SQL, ARGS)).rows;
    after.push(Number(process.hrtime.bigint() - s) / 1e6);
    if(r.length !== 1) throw new Error('بنچ ناسازگار');
  }
  after.sort((a, b) => a - b);

  /* شاهد planner */
  const plan = (await pool.query('EXPLAIN ANALYZE ' + AUTH_SQL, ARGS)).rows.map(r => Object.values(r)[0]).join('\n');

  /* ── قبل: find خطی روی آرایهٔ ۱M (عین کد قبلی auth.js) ── */
  console.log('بارگذاری ' + N + ' رکورد به حافظه برای شبیه‌سازی آینه …');
  const mirrorRows = (await pool.query('SELECT id, role, school_id, national_id, active, full_name, phone FROM users ORDER BY id')).rows;
  const phone = '0912' + String(N).padStart(7, '0');
  const norm = (s) => String(s || '').replace(/[\s\-()]/g, '');
  const before = [];
  for(let i = 0; i < 25; i++){
    const s = process.hrtime.bigint();
    const user = mirrorRows.find(u => norm(u.phone).slice(-10) === norm(phone).slice(-10));
    if(!user || user.id !== N) throw new Error('شبیه‌سازی find ناسازگار');
    before.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  before.sort((a, b) => a - b);

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const out = {
    n_users: N,
    before_linear_scan: { n: before.length, mean_ms: +(sum(before) / before.length).toFixed(3), p50_ms: +pct(before, .5).toFixed(3), p95_ms: +pct(before, .95).toFixed(3) },
    after_index_scan: { n: after.length, mean_ms: +(sum(after) / after.length).toFixed(3), p50_ms: +pct(after, .5).toFixed(3), p95_ms: +pct(after, .95).toFixed(3) },
    speedup_mean: +((sum(before) / before.length) / (sum(after) / after.length)).toFixed(1),
    plan_first_line: plan.split('\n')[0],
  };
  console.log(JSON.stringify(out, null, 2));
  await pool.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
