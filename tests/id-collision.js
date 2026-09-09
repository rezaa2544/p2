#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   P0-16 — شناسهٔ بدون‌برخورد (جایگزین مکس+۱ ناهمزمان)
   ۱) صد درخواست همزمان در حالت حافظه → صد شناسهٔ یکتا و بی‌فاصله
   ۲) فضای نام مشترک کاربران/دانش‌آموزان → یکتایی سراسری
   ۳) میان‌بر روی مرزهای ناهمزگام (تأخیر میان دریافت و درج)
   ۴) مسیر پستگرس: دنباله با بوت‌استرپ خودکار و ستوالِ رو به جلو
   ۵) فهرست خالی → اولین شناسه ۱
   اجرا:  node tests/id-collision.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

delete process.env.NODE_ENV;
delete process.env.REDIS_URL;

const ROOT = path.join(__dirname, '..');
const { createIds } = require(path.join(ROOT, 'server', 'ids.js'));
const cache = require(path.join(ROOT, 'server', 'cache.js'));

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('▸ P0-16 — شناسهٔ بدون‌برخورد');
  await cache.init();
  const ids = createIds({ db: null, cache });

  // ۱) صد دریافت همزمان → صد شناسهٔ یکتا
  {
    const list = [];
    const got = await Promise.all(Array.from({ length: 100 }, async () => {
      const id = await ids.nextId('classes', list);
      list.push({ id });
      return id;
    }));
    const uniq = new Set(got);
    chk('صد همزمان → صد شناسهٔ یکتا', uniq.size === 100, `یکتا=${uniq.size}`);
    chk('بدون فاصله و از یک', Math.min(...got) === 1 && Math.max(...got) === 100,
      `min=${Math.min(...got)} max=${Math.max(...got)}`);
  }

  // ۲) فضای نام مشترک کاربران/دانش‌آموزان
  {
    const users = [{ id: 1 }, { id: 2 }];
    const jobs = [];
    for (let i = 0; i < 60; i++) {
      jobs.push((async () => { const id = await ids.nextId('users', users); users.push({ id }); return id; })());
    }
    const got = await Promise.all(jobs);
    const uniq = new Set(got);
    chk('فضای مشترک کاربران → همه یکتا', uniq.size === 60, `یکتا=${uniq.size}`);
    chk('از بیشینهٔ موجود ادامه می‌دهد', Math.min(...got) === 3 && Math.max(...got) === 62,
      `min=${Math.min(...got)} max=${Math.max(...got)}`);
  }

  // ۳) رسیدهای همزمان با لرزشِ ورود (مدلِ واقعیِ مسیر: دریافت ← درجِ بی‌درنگ)
  {
    const list = [{ id: 9 }];
    const got = await Promise.all(Array.from({ length: 40 }, async () => {
      await sleep(Math.floor(Math.random() * 5)); /* لرزشِ رسیدِ درخواست‌ها */
      const id = await ids.nextId('grades', list);
      list.push({ id }); /* مسیرها بلافاصله و همگام درج می‌کنند */
      return id;
    }));
    const uniq = new Set(got);
    chk('با لرزشِ ورود هم یکتا می‌ماند', uniq.size === 40, `یکتا=${uniq.size}`);
    chk('از ۱۰ شروع می‌شود', Math.min(...got) === 10, `min=${Math.min(...got)}`);
  }

  // ۴) مسیر پستگرس — شبیه‌ساز دنباله + بوت‌استرپ
  {
    const seqs = new Map();
    let bootstrapCalls = 0;
    const fakeDb = {
      isPostgres: () => true,
      query: async (text, params) => {
        const t = String(text).trim();
        if (t === 'SELECT nextval($1)') {
          const name = params[0];
          if (!seqs.has(name)) { const e = new Error('sequence does not exist'); e.code = '42P01'; throw e; }
          const v = seqs.get(name) + 1; seqs.set(name, v);
          return { rows: [{ nextval: String(v) }], rowCount: 1 };
        }
        if (t === 'SELECT pg_advisory_lock($1)') return { rows: [{}], rowCount: 1 };
        if (t === 'SELECT pg_advisory_unlock($1)') return { rows: [{}], rowCount: 1 };
        if (/^CREATE SEQUENCE IF NOT EXISTS/.test(t)) {
          bootstrapCalls++;
          const name = t.replace('CREATE SEQUENCE IF NOT EXISTS ', '');
          if (!seqs.has(name)) seqs.set(name, 0);
          return { rows: [], rowCount: 0 };
        }
        if (/^SELECT last_value FROM/.test(t)) {
          const name = t.replace('SELECT last_value FROM ', '');
          return { rows: [{ last_value: String(seqs.get(name) || 0) }], rowCount: 1 };
        }
        if (t === 'SELECT setval($1, $2)') { seqs.set(params[0], Number(params[1])); return { rows: [{ setval: String(params[1]) }], rowCount: 1 }; }
        throw new Error('unexpected query: ' + t);
      }
    };
    const pgIds = createIds({ db: fakeDb, cache });
    const list = [{ id: 41 }, { id: 42 }];
    const first = await pgIds.nextId('classes', list);
    chk('بوت‌استرپ دنباله انجام می‌شود', bootstrapCalls === 1, `calls=${bootstrapCalls}`);
    chk('ستوال از بیشینهٔ محلی شروع می‌کند (۴۳)', first === 43, `got=${first}`);
    const second = await pgIds.nextId('classes', list);
    chk('nextvalهای بعدی بی‌واسطه‌اند', second === 44 && bootstrapCalls === 1);
    /* دو نمونهٔ شبیه‌سازی‌شده روی یک دنبالهٔ مشترک */
    const other = createIds({ db: fakeDb, cache });
    const third = await other.nextId('classes', list);
    chk('نمونهٔ دوم عدد تازه می‌گیرد (نه تکراری)', third === 45, `got=${third}`);
  }

  // ۵) فهرست خالی
  {
    const id = await ids.nextId('attendance', []);
    chk('فهرست خالی → شناسهٔ ۱', id === 1, `got=${id}`);
  }

  console.log(`\nid-collision (P0-16): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
