#!/usr/bin/env node
/* رگرسیونِ keyset-pagination موج ۳ (باگ‌هانت چت ۵، نشست ۴).
   ─────────────────────────────────────────────────────────────────
   W3-1: grades با `ORDER BY g.id DESC` پجینیت می‌شد ولی کرسرِ `id > cursor`
         بود — صفحهٔ دوم ردیف‌هایِ دیده‌شده را تکرار می‌کرد و بقیه را جا
         می‌انداخت (مسیرِ JS و DB هر دو).
   W3-2: attendance با `ORDER BY date DESC, id ASC` پجینیت می‌شد ولی کرسرِ
         تک‌ستونیِ `id > cursor` بود — همهٔ تاریخ‌هایِ قدیمی‌تر را می‌پراند.
         حالا کرسرِ مرکبِ `date|id` با predicateِ
         `date < $d OR (date = $d AND id > $i)`.
   هر دو مسیر (builderِ SQL و paginateArrayِ JS) باید بدونِ تکرار/حذف، همهٔ
   ردیف‌ها را در چند صفحه برگردانند.
   اجرا: node tests/wave3-keyset.js (بدونِ سرور/پورت) */
'use strict';
const { buildGradesList, buildAttendanceList, executePagedList } = require('../server/dbquery.js');
const { paginateArray } = require('../server/middleware/pagination.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function group(name) { console.log('\n▸ ' + name); }

const mgr = { id: 1, role: 'manager', school_id: 1 };

/* fake DB که predicate را واقعاً احترام می‌کند (شبیه PG) */
function fakeDbFor(rows) {
  return {
    async query(sql, params) {
      if (/^SELECT COUNT/i.test(sql)) return { rows: [{ n: rows.length }] };
      const cursorIdx = params.findIndex(p => typeof p === 'number' && (params[params.length - 2] === p || params.indexOf(p) === params.length - 2));
      /* در این فیک، فقط پارامترِ کرسر (اگر بود) را پیدا می‌کنیم: آخرین پارامتر LIMIT است. */
      const limitParam = params[params.length - 1];
      const cursorParam = params.length >= 2 ? params[params.length - 2] : null;
      let out = rows;
      if (typeof cursorParam === 'number' && !isNaN(cursorParam)) {
        if (/g\.id < \$\d+/.test(sql)) out = out.filter(r => r.id < cursorParam);
        else if (/g\.id > \$\d+/.test(sql)) out = out.filter(r => r.id > cursorParam);
      }
      return { rows: out.slice(0, Number(limitParam)) };
    }
  };
}

(async () => {
  /* ── W3-1: grades DESC keyset ── */
  group('W3-1 — grades (ORDER BY id DESC) keyset');

  await (async () => {
    const b = buildGradesList({ user: mgr, studentId: null, subjectId: null, classId: null, limit: 3, cursor: 5 });
    chk('G1 SQL از `g.id < $n` استفاده می‌کند (نه >)', /g\.id < \$\d+/.test(b.page.sql) && !/g\.id > \$\d+/.test(b.page.sql), b.page.sql);
    chk('G2 پارامترِ کرسر بایند شده', b.page.params.includes(5), JSON.stringify(b.page.params));
  })();

  await (async () => {
    /* ردیف‌های ۱۰..۱ با ترتیبِ نزولی — شبیه‌سازیِ PG */
    const rows = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(id => ({ id }));
    const db = fakeDbFor(rows);
    const seen = [];
    let cursor = null;
    for (let i = 0; i < 10; i++) {
      const built = buildGradesList({ user: mgr, studentId: null, subjectId: null, classId: null, limit: 3, cursor });
      const r = await executePagedList(db, built, { limit: 3, cursor });
      seen.push(...r.data.map(x => x.id));
      if (!r.pagination.has_more) break;
      cursor = r.pagination.next_cursor;
    }
    chk('G3 همهٔ ۱۰ ردیف دقیقاً یک‌بار دیده می‌شوند', seen.length === 10 && new Set(seen).size === 10 && seen.join(',') === '10,9,8,7,6,5,4,3,2,1', seen.join(','));
  })();

  await (async () => {
    /* parityِ مسیرِ JS: paginateArray با order:'desc' */
    const list = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(id => ({ id }));
    const p1 = paginateArray(list, { limit: 3, order: 'desc' });
    chk('G4 صفحهٔ اول [10,9,8] + next=8', p1.data.map(x => x.id).join(',') === '10,9,8' && p1.pagination.next_cursor === '8', JSON.stringify(p1));
    const p2 = paginateArray(list, { limit: 3, order: 'desc', cursor: p1.pagination.next_cursor });
    chk('G5 صفحهٔ دوم [7,6,5] بدون تکرار', p2.data.map(x => x.id).join(',') === '7,6,5', JSON.stringify(p2.data));
    const p3 = paginateArray(list, { limit: 3, order: 'desc', cursor: p2.pagination.next_cursor });
    chk('G6 صفحهٔ سوم [4,3,2]', p3.data.map(x => x.id).join(',') === '4,3,2', JSON.stringify(p3.data));
  })();

  /* ── W3-2: attendance composite keyset ── */
  group('W3-2 — attendance (ORDER BY date DESC, id ASC) composite keyset');

  await (async () => {
    const b = buildAttendanceList({ user: mgr, date: null, classId: null, studentId: null, limit: 5, cursor: '2026-09-08|3' });
    chk('A1 predicateِ مرکب `date < $d OR (date = $d AND id > $i)`',
      /date < \$\d+ OR \(date = \$\d+ AND id > \$\d+\)/.test(b.page.sql), b.page.sql);
    chk('A2 هم date و هم id بایند شده‌اند',
      b.page.params.includes('2026-09-08') && b.page.params.includes(3), JSON.stringify(b.page.params));
  })();

  await (async () => {
    /* ردیف‌های با دو تاریخ و idهای پراکنده */
    const rows = [
      { id: 30, date: '2026-09-10' },
      { id: 29, date: '2026-09-10' },
      { id: 28, date: '2026-09-09' },
      { id: 27, date: '2026-09-09' },
      { id: 26, date: '2026-09-08' }
    ];
    /* فیکِ DB که مثل PG: اول ORDER BY date DESC, id ASC بعد predicateِ مرکب */
    const db = {
      async query(sql, params) {
        if (/^SELECT COUNT/i.test(sql)) return { rows: [{ n: rows.length }] };
        const limit = params[params.length - 1];
        let out = rows.slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : a.id - b.id));
        const m = sql.match(/date < \$(\d+) OR \(date = \$(\d+) AND id > \$(\d+)\)/);
        if (m) {
          const d = params[Number(m[1]) - 1];
          const i = params[Number(m[3]) - 1];
          out = out.filter(r => (r.date < d) || (r.date === d && r.id > i));
        }
        return { rows: out.slice(0, Number(limit)) };
      }
    };
    const seen = [];
    let cursor = null;
    for (let i = 0; i < 6; i++) {
      const built = buildAttendanceList({ user: mgr, date: null, classId: null, studentId: null, limit: 2, cursor });
      const r = await executePagedList(db, built, { limit: 2, cursor });
      seen.push(...r.data.map(x => `${x.date}:${x.id}`));
      if (!r.pagination.has_more) break;
      cursor = r.pagination.next_cursor;
      if (cursor != null && !cursor.includes('|')) break; /* نباید کرسرِ bare-id برگردد */
    }
    chk('A3 کرسرِ بعدی مرکب است (date|id)', cursor == null || cursor.includes('|'), String(cursor));
    chk('A4 همهٔ ۵ ردیف به ترتیبِ date DESC,id ASC بدون تکرار/حذف',
      seen.join(',') === '2026-09-10:29,2026-09-10:30,2026-09-09:27,2026-09-09:28,2026-09-08:26', seen.join(','));
  })();

  await (async () => {
    const list = [
      { id: 30, date: '2026-09-10' },
      { id: 29, date: '2026-09-10' },
      { id: 28, date: '2026-09-09' },
      { id: 27, date: '2026-09-09' },
      { id: 26, date: '2026-09-08' }
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id - b.id);
    const p1 = paginateArray(list, { limit: 2, composite: true });
    chk('A5 صفحهٔ اول [10:29,10:30] + next=10|30',
      p1.data.map(x => `${x.date}:${x.id}`).join(',') === '2026-09-10:29,2026-09-10:30' && p1.pagination.next_cursor === '2026-09-10|30', JSON.stringify(p1.pagination));
    const p2 = paginateArray(list, { limit: 2, composite: true, cursor: p1.pagination.next_cursor });
    chk('A6 صفحهٔ دوم [9:27,9:28] بدون حذف',
      p2.data.map(x => `${x.date}:${x.id}`).join(',') === '2026-09-09:27,2026-09-09:28', JSON.stringify(p2.data));
    const p3 = paginateArray(list, { limit: 2, composite: true, cursor: p2.pagination.next_cursor });
    chk('A7 صفحهٔ سوم [8:26] + has_more=false',
      p3.data.map(x => `${x.date}:${x.id}`).join(',') === '2026-09-08:26' && p3.pagination.has_more === false, JSON.stringify(p3.pagination));
  })();

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
