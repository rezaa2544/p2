#!/usr/bin/env node
// tests/phase-c-regional-pg-reads.js — رگرسیونِ A-01
// گزارشِ هوشِ منطقه‌ای در PG-live دو مسیرِ زنده داشت که هیچ‌وقت اجرا نمی‌شدند:
//   (۱) کوئریِ مدارس به ستونِ ناموجودِ region_id اشاره داشت → همیشه خطا →
//       فال‌بکِ ساکت به آینهٔ درون‌حافظه‌ای.
//   (۲) خواندنِ داده‌هایِ مدارس (نمره/حضور/...) همیشه از store بود، حتی در
//       PG-live. وقتی آینه کامل نبود، مدارسِ واقعی به‌درستی «بدونِ داده»
//       و «نیازمندِ اقدامِ فوری» پرچم می‌شدند — گزارشِ ساکتِ غلط.
'use strict';

const assert = require('assert');
const { createAnalyticsRoutes } = require('../server/routes/analytics');

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}

const ADMIN = { id: 1, role: 'superadmin' };

/* یک دیتابیسِ جعلیِ PG-live: مدارس و داده‌ها را از «سمتِ PG» می‌دهد و
   آینهٔ store عمداً ناقص نگه داشته شده. */
function makeCtx(opts){
  const pg = !!opts.pg;
  const queries = [];
  const readCalls = [];
  const pgSchools = opts.pgSchools || [];
  const pgColl = opts.pgColl || {};
  const store = opts.store || { schools: [], grades: [], attendance: [], classes: [], schedule: [], counselor_refs: [], teacher_notes: [] };
  const db = {
    isPostgres: () => pg,
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (/FROM schools/.test(sql)) return { rows: pgSchools.slice() };
      return { rows: [] };
    },
    readCollection: async (name) => {
      readCalls.push(name);
      return (pgColl[name] || []).slice();
    }
  };
  return {
    store, db, queries, readCalls,
    routes: createAnalyticsRoutes({ store, db })
  };
}

function params(o){ const p = new URLSearchParams(); Object.keys(o).forEach(k => p.set(k, o[k])); return p; }

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  const pgSchools = [{ id: 100, name: 'مدرسهٔ ۱۰۰', district_id: 7, county_id: 70, province_id: 1 }];
  const pgGrades = [
    { id: 1, school_id: 100, student_id: 10, subject_id: 1, score: 18, term: 'term1' },
    { id: 2, school_id: 100, student_id: 11, subject_id: 1, score: 16, term: 'term1' }
  ];

  console.log('▸ A-01 · PG-live: مدارس و داده‌ها از PG خوانده می‌شوند');
  {
    const store = {
      schools: [{ id: 200, name: 'فقطِ آینه', district_id: 7 }],
      grades: [], attendance: [], classes: [], schedule: [], counselor_refs: [], teacher_notes: []
    };
    const ctx = makeCtx({
      pg: true, pgSchools, store,
      pgColl: { grades: pgGrades, attendance: [], classes: [], schedule: [], counselor_refs: [], teacher_notes: [] }
    });
    const r = await ctx.routes.regionalIntelligenceReport({ user: ADMIN }, params({ region_id: '7' }));
    chk('گزارش ۲۰۰ برمی‌گردد', () => assert.strictEqual(r.status, 200, JSON.stringify(r)));
    chk('کوئریِ مدارس دیگر به region_id ناموجود اشاره ندارد',
      () => {
        const q = ctx.queries.find((x) => /FROM schools/.test(x.sql));
        assert.ok(q, 'no schools query was issued at all');
        assert.ok(!/region_id/.test(q.sql), 'query still references missing region_id: ' + q.sql);
        assert.ok(/district_id/.test(q.sql), 'query should match on district_id: ' + q.sql);
      });
    chk('مسیرِ زندهٔ PG واقعاً اجرا شد (فال‌بک نرفت)',
      () => assert.ok(ctx.queries.length >= 1 && ctx.readCalls.length >= 1,
        'queries=' + ctx.queries.length + ' readCollections=' + ctx.readCalls.length));
    chk('readCollection برای شش مجموعه فراخوانی شد',
      () => assert.deepStrictEqual(ctx.readCalls.sort(),
        ['attendance', 'classes', 'counselor_refs', 'grades', 'schedule', 'teacher_notes'],
        JSON.stringify(ctx.readCalls)));
    chk('مدرسهٔ فقطِ آینه‌ای (۲۰۰) در گزارش نیست — منبع PG حاکم است',
      () => {
        const snap = r.body.snapshot;
        const eh = snap.educational_health_summary || {};
        assert.strictEqual(snap.school_count, 1, 'school_count: ' + snap.school_count);
        assert.strictEqual(eh.total_schools, 1, 'total_schools: ' + eh.total_schools);
      });
    chk('مدرسهٔ PG با داده، «بدونِ داده» پرچم نمی‌شود',
      () => {
        const eh = r.body.snapshot.educational_health_summary || {};
        assert.strictEqual(eh.schools_with_no_data_count, 0, 'no-data count: ' + JSON.stringify(eh));
      });
  }

  console.log('▸ A-01 · حالتِ JSON: مسیرِ آینهٔ درون‌حافظه‌ای دست‌نخورده است');
  {
    const store = {
      schools: [{ id: 300, name: 'مدرسهٔ آینه', district_id: 9 }],
      grades: [{ id: 5, school_id: 300, student_id: 1, subject_id: 1, score: 19 }],
      attendance: [], classes: [], schedule: [], counselor_refs: [], teacher_notes: []
    };
    const ctx = makeCtx({ pg: false, store });
    const r = await ctx.routes.regionalIntelligenceReport({ user: ADMIN }, params({ region_id: '9' }));
    chk('گزارش ۲۰۰ برمی‌گردد', () => assert.strictEqual(r.status, 200, JSON.stringify(r)));
    chk('مدرسه از آینهٔ درون‌حافظه‌ای می‌آید',
      () => {
        const snap = r.body.snapshot;
        assert.strictEqual(snap.school_count, 1, 'school_count: ' + snap.school_count);
      });
    chk('در حالتِ JSON هیچ readCollectionای فراخوانی نمی‌شود',
      () => assert.strictEqual(ctx.readCalls.length, 0, JSON.stringify(ctx.readCalls)));
  }

  console.log('▸ A-01 · شکستِ یک readCollection، کلِ گزارش را نمی‌اندازد');
  {
    const store = {
      schools: [{ id: 100, name: 'مدرسهٔ ۱۰۰', district_id: 7 }],
      grades: [{ id: 9, school_id: 100, student_id: 1, subject_id: 1, score: 15 }],
      attendance: [], classes: [], schedule: [], counselor_refs: [], teacher_notes: []
    };
    const pg = {
      isPostgres: () => true,
      query: async () => ({ rows: store.schools.slice() }),
      readCollection: async (name) => {
        if (name === 'grades') throw new Error('pg connection lost');
        return [];
      }
    };
    const routes = createAnalyticsRoutes({ store, db: pg });
    const r = await routes.regionalIntelligenceReport({ user: ADMIN }, params({ region_id: '7' }));
    chk('گزارش با فال‌بکِ مجموعه بازگشت (۲۰۰)',
      () => assert.strictEqual(r.status, 200, JSON.stringify(r)));
    chk('مدرسه گزارش شد',
      () => {
        assert.strictEqual(r.body.snapshot.school_count, 1, 'school_count: ' + r.body.snapshot.school_count);
      });
  }

  await Promise.all(checks);
  console.log('\n──────────────────────────────────────────');
  if (failures.length) {
    console.log('phase-c-regional-pg-reads: ' + pass + ' موفق، ' + failures.length + ' ناموفق');
    console.log('ناموفق‌ها: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('phase-c-regional-pg-reads: ' + pass + '/' + pass + ' موفق ✅');
}
