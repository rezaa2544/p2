/* ═══════════════════════════════════════════════════════════════════
   server/partitioning.js — Partitioningِ وزن‌دار برای مدارسِ شلوغ (فاز ۲.۴)
   ───────────────────────────────────────────────────────────────────
   دو چیزِ متفاوت را نباید قاطی کرد:

   ۱) **تصمیمِ مسیریابی** (shard/replica/tier) — کدام مدرسه کجا می‌رود.
      این بخش امروز «تصمیم» می‌سازد و قابلِ اندازه‌گیری/آزمون است، ولی تا
      وقتی پایگاهِ رابطه‌ای فعال نباشد (در این استقرار فعال نیست — ببینید
      پایین) مقصدی ندارد. دروغ نمی‌گوییم: اینجا فقط **نقشه** است.

   ۲) **مسیرِ خواندنِ تفکیک‌شده** (per-school index) — کاری که امروز هم
      واقعاً اثر دارد. هر خوانشِ محدودشده به مدرسه، امروز کلِ مجموعه را
      پویش می‌کند (`filterByScope` روی آرایهٔ کامل). با نمایهٔ تفکیک‌شده،
      هزینه از O(کلِ ردیف‌ها) می‌شود O(ردیف‌های همان مدرسه).

   چرا نمایه «حافظِ ترتیب» است؟ چون مسیرها بعد از فیلتر، صفحه‌بندی
   می‌کنند؛ اگر ردیف‌هایِ یک مدرسه را جدا و بعد ردیف‌هایِ بی‌مدرسه را به
   آن بچسبانیم، ترتیبِ خروجی عوض می‌شود و نتایجِ صفحه‌بندی (و هر تستی که
   به ترتیب حساس باشد) بی‌دلیل می‌شکند. پس نمایه جایگاه‌ها را نگه
   می‌دارد و پرسش، دو فهرستِ مرتّب را ادغام می‌کند.

   چرا وزن؟ چون مدارس هم‌اندازه نیستند: در دادهٔ کنونی، سه مدرسهٔ اول
   حدود سه‌چهارمِ ردیف‌ها را دارند (ضریبِ تغییرات ≈ ۰٫۴۹). تقسیمِ ساده‌لوحانه
   بر اساسِ «تعداد مدرسه» شاردهایِ کاملاً نامتوازن می‌سازد.

   اجرا: server/index.js آن را می‌سازد و به sync/scope وصل می‌کند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* مجموعه‌هایِ سنگین — همان‌هایی که ردیف‌هایشان با رشدِ مدرسه رشد می‌کنند */
const HEAVY_DEFAULT = ['attendance', 'grades', 'students', 'enrollments', 'discipline',
                       'installments', 'notifications', 'messages', 'parent_links'];

/* وزنِ هر مجموعه در «بارِ مدرسه» — یک ردیفِ نمره/حضور ارزان‌تر از یک
   دانش‌آموز است چون student ردیف‌هایِ وابسته می‌سازد. */
const WEIGHTS_DEFAULT = { students: 3, enrollments: 2, attendance: 1, grades: 1,
                          discipline: 1, installments: 1, notifications: 1,
                          messages: 1, parent_links: 1 };

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };

function createPartitioning(opts){
  const o = opts || {};
  const store = o.store || {};
  const heavy = o.heavy || HEAVY_DEFAULT;
  const wOf   = Object.assign({}, WEIGHTS_DEFAULT, o.weights || {});

  /* آستانه‌ها — قابلِ تنظیم با env تا «مدرسه‌ی شلوغ» در مقیاسِ واقعی
     معنا پیدا کند (در دادهٔ نمونهٔ این مخزن بزرگ‌ترین مدرسه ۱۳۵
     دانش‌آموز دارد، پس آستانه‌ی ۱۰۰۰ اینجا تهی است — عمداً همین‌طور
     مانده تا تفاوتِ «مکانیزم» و «دادهٔ نمونه» روشن بماند). */
  const HOT_STUDENTS = num(o.hotStudents != null ? o.hotStudents : process.env.PAYESH_HOT_STUDENTS, 1000);
  const HOT_ROWS     = num(o.hotRows     != null ? o.hotRows     : process.env.PAYESH_HOT_ROWS, 20000);
  const SHARDS       = Math.max(1, num(o.shards != null ? o.shards : process.env.PAYESH_SHARDS, 4));

  /* نمایه‌ها: coll -> { rows (مرجع), len, pos: Map(key -> [index...]) } */
  const idx = new Map();
  const stats = { builds: 0, hits: 0, misses: 0, buildMs: 0, invalidations: 0, lastBuild: null };

  /* شمارشِ دانش‌آموزِ هر مدرسه (students خود school_id ندارند:
     دانش‌آموز ← enrollments ← classes.school_id) */
  let stuCache = null;
  function studentsBySchool(force){
    if(stuCache && !force) return stuCache;
    const classSchool = {};
    for(const c of (store.classes || [])) classSchool[c.id] = c.school_id;
    const out = {};
    for(const sc of (store.schools || [])) out[sc.id] = new Set();
    for(const e of (store.enrollments || [])){
      const sid = classSchool[e.class_id];
      if(!sid) continue;
      if(!out[sid]) out[sid] = new Set();
      out[sid].add(e.student_id);
    }
    const res = {};
    for(const k of Object.keys(out)) res[k] = out[k].size;
    stuCache = res;
    return res;
  }

  /* ── وزنِ هر مدرسه ──────────────────────────────────────────────── */
  function weights(force){
    if(force) stuCache = null;
    const stu = studentsBySchool(force);
    const out = {};
    for(const sc of (store.schools || [])){
      out[sc.id] = { school_id: sc.id, name: sc.name || ('مدرسهٔ ' + sc.id), students: stu[sc.id] || 0, rows: {}, weight: 0 };
    }
    for(const coll of heavy){
      const rows = store[coll];
      if(!Array.isArray(rows)) continue;
      const w = wOf[coll] == null ? 1 : wOf[coll];
      for(const r of rows){
        const sid = r ? r.school_id : null;
        if(sid == null) continue;
        if(!out[sid]) out[sid] = { school_id: sid, name: 'مدرسهٔ ' + sid, students: stu[sid] || 0, rows: {}, weight: 0 };
        out[sid].rows[coll] = (out[sid].rows[coll] || 0) + 1;
        out[sid].weight += w;
      }
    }
    for(const k of Object.keys(out)) out[k].weight += (out[k].students || 0) * (wOf.students || 1);
    return out;
  }

  function weightList(force){
    const w = weights(force);
    return Object.keys(w).map(k => w[k])
      .sort((a, b) => (b.weight - a.weight) || (Number(a.school_id) - Number(b.school_id)));
  }

  /* ── مدارسِ شلوغ ────────────────────────────────────────────────── */
  function hotSchools(list){
    const all = list || weightList(true);
    return all
      .filter(s => (s.students || 0) >= HOT_STUDENTS || totalRows(s) >= HOT_ROWS)
      .map(s => ({ school_id: s.school_id, name: s.name, students: s.students,
                   rows: totalRows(s), weight: s.weight,
                   reason: (s.students || 0) >= HOT_STUDENTS ? 'students' : 'rows' }));
  }
  const totalRows = (s) => Object.keys(s.rows || {}).reduce((a, k) => a + s.rows[k], 0);

  /* ── تقسیمِ وزن‌دار (LPT: بلندترین کار اول) ───────────────────────
     قطعی است: مدرسه‌ها را از سنگین به سبک می‌چینیم و هر کدام را به
     کم‌بارترین شارد می‌دهیم؛ تساوی را شناسه تعیین می‌کند. همین قطعی‌بودن
     یعنی هر نمونهٔ سرور (بدون هماهنگی) به همان نقشه می‌رسد. */
  function weightedShards(count, list){
    const n = Math.max(1, num(count, SHARDS));
    const all = (list || weightList(true)).slice();
    const shards = [];
    for(let i = 0; i < n; i++) shards.push({ shard: i, weight: 0, students: 0, schools: [] });
    const assign = {};
    /* سنگین → سبک؛ تساوی با شناسه (پایدار در همهٔ نمونه‌ها) */
    all.sort((a, b) => (b.weight - a.weight) || (Number(a.school_id) - Number(b.school_id)));
    for(const s of all){
      let best = 0;
      for(let i = 1; i < shards.length; i++){
        if(shards[i].weight < shards[best].weight) best = i;
      }
      shards[best].weight += s.weight;
      shards[best].students += (s.students || 0);
      shards[best].schools.push(s.school_id);
      assign[s.school_id] = best;
    }
    const loads = shards.map(s => s.weight);
    const mean = loads.reduce((a, b) => a + b, 0) / (loads.length || 1);
    const sd = Math.sqrt(loads.reduce((a, b) => a + (b - mean) ** 2, 0) / (loads.length || 1));
    return {
      shards: shards,
      assign: assign,
      balance: {
        shards: shards.length,
        min: loads.length ? Math.min.apply(null, loads) : 0,
        max: loads.length ? Math.max.apply(null, loads) : 0,
        mean: Math.round(mean * 100) / 100,
        stdev: Math.round(sd * 100) / 100,
        cov: mean ? Math.round((sd / mean) * 1000) / 1000 : 0,      /* ضریبِ تغییرات */
        imbalance: mean ? Math.round((Math.max.apply(null, loads.concat([0])) / mean) * 1000) / 1000 : 0,
      }
    };
  }

  /* ── مسیریابی ───────────────────────────────────────────────────── */
  let planCache = null;
  function plan(force){
    if(planCache && !force) return planCache;
    const list = weightList(force);
    const p = weightedShards(SHARDS, list);
    const hot = {};
    for(const h of hotSchools(list)) hot[h.school_id] = h;
    planCache = { list: list, shards: p.shards, assign: p.assign, balance: p.balance, hot: hot };
    return planCache;
  }
  /** تصمیمِ مسیریابی برای یک مدرسه (نقشه — مقصدش وقتی PG فعال شود معنا دارد) */
  function routeFor(schoolId){
    const p = plan();
    const id = Number(schoolId);
    const school = p.list.find(s => Number(s.school_id) === id) || null;
    const isHot = !!p.hot[id];
    return {
      school_id: schoolId,
      shard: p.assign[id] == null ? (p.assign[String(id)] == null ? 0 : p.assign[String(id)]) : p.assign[id],
      tier: isHot ? 'hot' : 'normal',
      replica: isHot,                 /* پیشنهاد: مدرسهٔ شلوغ از read replica بخواند */
      weight: school ? school.weight : 0,
      students: school ? school.students : 0,
      rows: school ? totalRows(school) : 0,
    };
  }

  /* ── نمایهٔ تفکیک‌شده (چیزی که امروز اثر دارد) ──────────────────── */
  function ensure(coll){
    const rows = store[coll];
    if(!Array.isArray(rows)) return null;
    const cur = idx.get(coll);
    if(cur && cur.rows === rows && cur.len === rows.length) { stats.hits++; return cur; }
    const t0 = process.hrtime.bigint();
    const pos = new Map();
    for(let i = 0; i < rows.length; i++){
      const r = rows[i];
      const key = (r && r.school_id != null) ? String(r.school_id) : '*';
      let bucket = pos.get(key);
      if(!bucket){ bucket = []; pos.set(key, bucket); }
      bucket.push(i);
    }
    const rec = { rows: rows, len: rows.length, pos: pos, at: Date.now() };
    idx.set(coll, rec);
    stats.builds++;
    stats.misses++;
    stats.buildMs += Number(process.hrtime.bigint() - t0) / 1e6;
    stats.lastBuild = rec.at;
    return rec;
  }

  /** ردیف‌های یک مدرسه (به‌علاوهٔ ردیف‌های بی‌مدرسه) — **با حفظِ ترتیبِ اصلی** */
  function rowsFor(coll, schoolId){
    const rec = ensure(coll);
    if(!rec) return [];
    const a = rec.pos.get(String(schoolId)) || [];
    const b = rec.pos.get('*') || [];
    if(!b.length) return a.map(i => rec.rows[i]);
    if(!a.length) return b.map(i => rec.rows[i]);
    /* ادغامِ دو فهرستِ صعودی — ترتیبِ آرایهٔ اصلی حفظ می‌شود */
    const out = [];
    let i = 0, j = 0;
    while(i < a.length && j < b.length){
      if(a[i] < b[j]) out.push(rec.rows[a[i++]]);
      else out.push(rec.rows[b[j++]]);
    }
    while(i < a.length) out.push(rec.rows[a[i++]]);
    while(j < b.length) out.push(rec.rows[b[j++]]);
    return out;
  }

  /** خواندنِ محدودشده به مدرسه — جایگزینِ پویشِ کامل در filterByScope */
  function scoped(user, coll){
    const rows = store[coll];
    if(!Array.isArray(rows)) return [];
    if(!user || user.role === 'superadmin' || user.role === 'edu_office') return rows; /* همه — رفتارِ فعلی */
    return rowsFor(coll, user.school_id);
  }

  /** پس از هر نوشتن — نمایه بی‌اعتبار می‌شود (sync.js صدا می‌زند) */
  function invalidate(coll){
    stats.invalidations++;
    if(coll == null){ idx.clear(); stuCache = null; planCache = null; return; }
    idx.delete(coll);
    stuCache = null;      /* ممکن است ثبت‌نام/دانش‌آموز عوض شده باشد */
    planCache = null;     /* وزن‌ها عوض شده‌اند */
  }

  /* ── متریک‌ها (پایش) ────────────────────────────────────────────── */
  function report(force){
    const p = plan(force);
    const hot = Object.keys(p.hot).map(k => p.hot[k]);
    return {
      thresholds: { students: HOT_STUDENTS, rows: HOT_ROWS, shards: SHARDS },
      schools: p.list.length,
      hot: hot,
      hotCount: hot.length,
      balance: p.balance,
      shards: p.shards.map(s => ({ shard: s.shard, weight: s.weight, students: s.students, schools: s.schools.length })),
      index: {
        collections: idx.size,
        builds: stats.builds,
        hits: stats.hits,
        misses: stats.misses,
        buildMs: Math.round(stats.buildMs * 100) / 100,
        invalidations: stats.invalidations,
        lastBuild: stats.lastBuild,
      },
    };
  }

  function reset(){ idx.clear(); stuCache = null; planCache = null; }

  return { weights, weightList, hotSchools, weightedShards, plan, routeFor,
           rowsFor, scoped, invalidate, report, reset,
           _stats: stats, _heavy: heavy, _wOf: wOf };
}

module.exports = { createPartitioning };
