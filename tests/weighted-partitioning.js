#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const partitioning = require('../server/partitioning');

const ROOT = path.join(__dirname, '..');
let ok = 0, total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    ok++;
    console.log('  ✅ ' + name);
  } catch (err) {
    console.error('  ❌ ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function has(text, needle) { assert(text.includes(needle), 'missing: ' + needle); }

function makeStore() {
  const enrollments = [];
  let id = 1;
  function add(school, n) {
    for (let i = 1; i <= n; i++) enrollments.push({ id: id++, school_id: school, student_id: school * 100000 + i });
  }
  add(1, 12);
  add(2, 1000);
  add(3, 1405);
  add(4, 80);
  enrollments.push({ id: id++, school_id: 3, student_id: 300001 }); // duplicate must not inflate
  return { enrollments, schools: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] };
}

async function withEnv(patch, fn) {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = process.env[k]; if (patch[k] === undefined) delete process.env[k]; else process.env[k] = patch[k]; }
  try { return await fn(); }
  finally { for (const k of Object.keys(patch)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}

async function main() {
  console.log('\n▸ Weighted partitioning contract');

  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'WEIGHTED_PARTITIONING.md'), 'utf8');
  const dbSrc = fs.readFileSync(path.join(ROOT, 'server', 'db.js'), 'utf8');
  const schema = fs.readFileSync(path.join(ROOT, 'server', 'schema.sql'), 'utf8');
  const roadmap = fs.readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf8');

  await test('سند WEIGHTED_PARTITIONING.md وجود دارد و سه گزینه را پوشش می‌دهد', () => {
    has(doc, 'گزینه A');
    has(doc, 'گزینه B');
    has(doc, 'پارتیشن‌بندی فیزیکی PostgreSQL');
    has(doc, 'PAYESH_HEAVY_SCHOOL_THRESHOLD=1000');
  });

  await test('شمارش enrollment بر اساس دانش‌آموز یکتا است', () => {
    const counts = partitioning.enrollmentCountsBySchool(makeStore());
    assert(counts[1] === 12, 'school 1 count');
    assert(counts[2] === 1000, 'school 2 count');
    assert(counts[3] === 1405, 'school 3 duplicate inflated');
  });

  await test('مدارس شلوغ با آستانه ۱۰۰۰ شناسایی و نزولی مرتب می‌شوند', () => {
    const heavy = partitioning.largeSchools(makeStore(), 1000);
    assert(heavy.length === 2, 'heavy length');
    assert(heavy[0].school_id === 3 && heavy[0].enrollment === 1405, 'largest first');
    assert(heavy[1].school_id === 2 && heavy[1].enrollment === 1000, 'threshold inclusive');
  });

  await test('پیکربندی shard وزنی از CSV و JSON خوانده می‌شود', () => {
    const csv = partitioning.parseShardConfig('a:1,b:2,heavy-x:5');
    assert(csv.length === 3 && csv[2].dedicated && csv[2].weight === 5, 'csv parse');
    const json = partitioning.parseShardConfig('[{"id":"h","weight":4,"dedicated":true}]');
    assert(json.length === 1 && json[0].id === 'h' && json[0].dedicated, 'json parse');
  });

  await test('برنامه routing مدارس شلوغ را روی shard اختصاصی می‌گذارد', () => {
    const plan = partitioning.buildRoutingPlan(makeStore(), {
      enabled: true,
      heavyThreshold: 1000,
      shards: [{ id: 'shared-a', weight: 1 }, { id: 'heavy-a', weight: 4, dedicated: true }],
      readReplicas: ['postgresql://ro:pw@replica-a:6432/payesh']
    });
    assert(plan.routes[1].heavy === false, 'normal school marked heavy');
    assert(plan.routes[2].heavy === true, 'threshold school not heavy');
    assert(plan.routes[3].shard_id === 'heavy-a', 'heavy school not on dedicated shard');
  });

  await test('read مدرسه شلوغ به replica و write همان مدرسه به primary می‌رود', () => {
    const plan = partitioning.buildRoutingPlan(makeStore(), {
      enabled: true,
      heavyThreshold: 1000,
      shards: [{ id: 'shared-a', weight: 1 }, { id: 'heavy-a', weight: 4, dedicated: true }],
      readReplicas: ['postgresql://ro:pw@replica-a:6432/payesh']
    });
    const read = partitioning.routeForSchool(plan, 3, 'read');
    const write = partitioning.routeForSchool(plan, 3, 'write');
    assert(read.target === 'read-replica', 'heavy read must use replica');
    assert(write.target === 'primary', 'write must stay primary');
  });

  await test('مدرسه ناشناخته fail-closed به primary route می‌شود', () => {
    const plan = partitioning.buildRoutingPlan(makeStore(), { enabled: true, heavyThreshold: 1000 });
    const r = partitioning.routeForSchool(plan, 999, 'read');
    assert(r.target === 'primary' && r.reason === 'unknown_school', 'unknown school must go primary');
  });

  await test('متریک‌ها تعداد مدارس، heavy و توزیع shard را می‌دهند', () => {
    const plan = partitioning.buildRoutingPlan(makeStore(), { enabled: true, heavyThreshold: 1000, shards: [{ id: 's', weight: 1 }, { id: 'h', weight: 1, dedicated: true }] });
    const m = partitioning.metricsForPlan(plan);
    assert(m.schools === 4, 'school count');
    assert(m.heavy_schools === 2, 'heavy count');
    assert(m.total_enrollment === 2497, 'total enrollment');
    assert(m.shards.h.heavy_schools === 2, 'heavy shard metrics');
  });

  await test('تحلیل schema ایندکس school_id جدول‌های پرترافیک را تأیید می‌کند', () => {
    const rows = partitioning.analyzeSchema(schema);
    const by = Object.fromEntries(rows.map(r => [r.table, r]));
    ['attendance', 'grades', 'enrollments', 'classes'].forEach(t => {
      assert(by[t] && by[t].has_school_id, t + ' missing school_id');
      assert(by[t].has_school_fk, t + ' missing school FK');
      assert(by[t].has_school_index, t + ' missing school_id index');
    });
  });

  await test('server/db.js گزینه سوم query و routeQuery را دارد', () => {
    has(dbSrc, 'async function query(text, params, opts)');
    has(dbSrc, 'routeQuery(opts || {})');
    has(dbSrc, 'partitioningHealth');
    has(dbSrc, 'DATABASE_READ_REPLICA_URLS');
  });

  await test('db.query برای read مدرسه شلوغ از replica pool استفاده می‌کند', async () => {
    await withEnv({
      PAYESH_WEIGHTED_PARTITIONING: '1',
      PAYESH_HEAVY_SCHOOL_THRESHOLD: '1000',
      DATABASE_READ_REPLICA_URLS: 'postgresql://ro:pw@replica-a:6432/payesh'
    }, async () => {
      delete require.cache[require.resolve('../server/db')];
      const db = require('../server/db');
      let primaryHits = 0, replicaHits = 0;
      db.__refreshPartitionPlanForTests(makeStore());
      db.__setPoolForTests({ totalCount: 1, idleCount: 1, waitingCount: 0, query: async () => { primaryHits++; return { rows: [{ src: 'primary' }], rowCount: 1 }; }, end: async () => {} });
      db.__setReplicaPoolsForTests([{ totalCount: 1, idleCount: 1, waitingCount: 0, query: async () => { replicaHits++; return { rows: [{ src: 'replica' }], rowCount: 1 }; }, end: async () => {} }]);
      const r1 = await db.query('SELECT 1', [], { schoolId: 3, readOnly: true });
      const r2 = await db.query('SELECT 1', [], { schoolId: 3, operation: 'write' });
      assert(r1.rows[0].src === 'replica', 'read did not hit replica');
      assert(r2.rows[0].src === 'primary', 'write did not hit primary');
      assert(primaryHits === 1 && replicaHits === 1, 'hit counts wrong');
      const h = db.partitioningHealth();
      assert(h.replica_reads === 1 && h.writes === 1, 'query metrics wrong');
      await db.close();
      delete require.cache[require.resolve('../server/db')];
    });
  });

  await test('ROADMAP فاز Weighted Partitioning را کامل نشان می‌دهد', () => {
    has(roadmap, 'Weighted Partitioning برای مدارس شلوغ | ✅ کامل');
  });
}

main().catch(err => { console.error(err); process.exit(1); });
process.on('beforeExit', () => {
  if (ok !== total) {
    console.error(`\nweighted-partitioning: ${ok}/${total} سبز — خطا دارد ❌`);
    process.exitCode = 1;
  } else {
    console.log(`\nweighted-partitioning: ${ok}/${total} سبز ✅`);
  }
});
