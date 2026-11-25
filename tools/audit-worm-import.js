'use strict';
/* tools/audit-worm-import.js — M15-05: تغذیهٔ جدولِ WORM audit از فایلِ
   append-only (server/audit.js) + راستی‌آزماییِ زنجیرهٔ hash.
   ───────────────────────────────────────────────────────────────────
   - migration: migrations/027_audit_worm.sql (REVOKE + trigger + hash chain)
                migrations/029_audit_worm_fp.sql (اثرِ انگشتِ payload)
   - حالت‌ها: (پیش‌فرض) import دیفرانسیل · --verify = بازمحاسبهٔ زنجیره
     و کشفِ هر دستکاری · --dry = بدونِ نوشتن
   - fail-closed: بدونِ PostgreSQL زنده (db.init + isPostgres) هر دو حالت
     با PG_REQUIRED و exit 2 تمام می‌شوند — «rows=0» جعلی هرگز چاپ
     نمی‌شود (رفعِ فالس‌گرینِ verify).
   - شناسهٔ رویداد: خطوطِ audit.log فاقدِ seq عددی‌اند؛ import با
     fp = sha256(canonical(payload)) تکرارها را بی‌اثر می‌کند و seq را
     از دنبالهٔ جدول می‌دهد (خطِ دارایِ seq عددیِ تازه، همان seq را می‌گیرد).
   - زنجیره: hash = sha256(prev_hash + '\n' + canonical(payload)) — canonical =
     JSON با کلیدهایِ مرتب (پایدار بینِ اجراها)
   Run: node tools/audit-worm-import.js [--verify] [--dry]
*/
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const AUDIT_FILE = process.env.PAYESH_AUDIT || path.join(__dirname, '..', 'server', 'data', 'audit.log');
const GENESIS = 'GENESIS';

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function chainHash(prevHash, payloadObj) {
  return crypto.createHash('sha256').update(prevHash + '\n' + canonical(payloadObj), 'utf8').digest('hex');
}
function fingerprint(payloadObj) {
  return crypto.createHash('sha256').update(canonical(payloadObj), 'utf8').digest('hex').slice(0, 32);
}
/* parse a JSONL audit line → {seq, actor, action, payload} | null */
function parseLine(line) {
  if (!line || !line.trim()) return null;
  let obj;
  try { obj = JSON.parse(line); } catch (e) { return { corrupt: true, line }; }
  const seq = Number(obj.seq != null ? obj.seq : obj.t);
  const payload = obj;
  return {
    seq: Number.isFinite(seq) ? seq : null,
    actor: obj.actor != null ? String(obj.actor) : (obj.user_id != null ? String(obj.user_id) : null),
    action: String(obj.action || obj.event || 'unknown'),
    payload
  };
}

(async () => {
  const args = process.argv.slice(2);
  const verifyOnly = args.indexOf('--verify') > -1;
  const dry = args.indexOf('--dry') > -1;

  if (!fs.existsSync(AUDIT_FILE)) {
    console.error('AUDIT_FILE_NOT_FOUND: ' + AUDIT_FILE);
    process.exit(2);
  }

  /* fail-closed مشترک هر دو حالت: بدونِ PG زنده هیچ نتیجه‌ای معتبر نیست */
  try { await db.init(); } catch (e) { /* init error → خط زیر می‌گیرد */ }
  if (!db.isPostgres()) {
    console.error('PG_REQUIRED: این ابزار جدولِ WORM را در PostgreSQL می‌نویسد/می‌خواند — PostgreSQL زنده (DATABASE_URL) تنظیم نیست (fail-closed).');
    process.exit(2);
  }

  const lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n');
  const parsed = lines.map(parseLine).filter(Boolean);

  if (verifyOnly) {
    /* --verify: زنجیرهٔ جدول را از GENESIS بازمحاسبه کن */
    const res = await db.query('SELECT seq, payload, prev_hash, hash FROM audit_events_worm ORDER BY seq ASC');
    if (!res || !Array.isArray(res.rows)) {
      console.error('PG_VERIFY_FAILED: خواندنِ جدولِ WORM ممکن نشد.');
      process.exit(2);
    }
    let prev = GENESIS, broken = 0;
    for (const r of res.rows) {
      const payloadObj = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
      const expect = chainHash(prev, payloadObj);
      if (r.prev_hash !== prev || r.hash !== expect) {
        broken++;
        console.error('CHAIN BROKEN at seq=' + r.seq + ' (expected ' + expect.slice(0, 12) + '…, got ' + String(r.hash).slice(0, 12) + '…)');
      }
      prev = r.hash;
    }
    console.log('VERIFY: rows=' + res.rows.length + ' broken=' + broken + (res.rows.length === 0 ? ' (WORM EMPTY — هنوز چیزی import نشده)' : ''));
    await closePool();
    process.exit(broken ? 1 : 0);
  }

  /* import دیفرانسیل با fp: تکرارِ همان payload = بی‌اثر؛ رویدادِ تازه =
     seq از دنبالهٔ جدول (یا seq عددیِ خودِ خط اگر > دنباله بود). */
  const cur = await db.query('SELECT COALESCE(MAX(seq), 0) AS m FROM audit_events_worm');
  if (!cur || !Array.isArray(cur.rows) || !cur.rows[0]) {
    console.error('PG_REQUIRED: خواندنِ دنبالهٔ WORM ممکن نشد (fail-closed).');
    process.exit(2);
  }
  let lastSeq = Number(cur.rows[0].m) || 0;
  let prevHash = GENESIS;
  const tail = await db.query('SELECT hash FROM audit_events_worm WHERE seq = $1', [lastSeq]);
  if (tail && tail.rows && tail.rows.length) prevHash = tail.rows[0].hash;

  /* fpهایِ موجود = مجموعهٔ idempotency */
  const seen = new Set();
  const existing = await db.query('SELECT fp FROM audit_events_worm WHERE fp IS NOT NULL');
  for (const r of (existing.rows || [])) seen.add(r.fp);

  let imported = 0, skipped = 0, corrupt = 0;
  for (const p of parsed) {
    if (p.corrupt) { corrupt++; continue; }
    const fp = fingerprint(p.payload);
    if (seen.has(fp)) { skipped++; continue; }
    let seq;
    if (p.seq != null && p.seq > lastSeq) seq = p.seq;
    else seq = lastSeq + 1;
    const hash = chainHash(prevHash, p.payload);
    if (!dry) {
      await db.query(
        'INSERT INTO audit_events_worm (seq, actor, action, payload, fp, prev_hash, hash) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)',
        [seq, p.actor, p.action, JSON.stringify(p.payload), fp, prevHash, hash]
      );
    }
    seen.add(fp);
    lastSeq = seq;
    prevHash = hash;
    imported++;
  }
  console.log((dry ? 'DRY-RUN: ' : '') + 'imported=' + imported + ' skipped(fp-dup)=' + skipped + ' corrupt=' + corrupt);
  await closePool();
  /* G7: خروجِ موفق = پایانِ طبیعیِ فرایند (بدونِ exit(0) صریح)؛ pool
     بسته می‌شود تا event loop خالی و پروسه با کدِ 0 خارج شود — در
     غیرِ این صورت ابزار روی poolِ بازِ idle برای همیشه می‌ماند. */
})().catch((e) => {
  console.error('WORM_IMPORT_FATAL: ' + (e && e.message ? e.message : String(e)));
  process.exit(2);
});

/* پایانِ تمیزِ pool — کلاینت‌هایِ idle نگه‌داشته‌شده نباید پروسه را
   زنده نگه دارند؛ در نبودِ pool (fail قبلی) بی‌اثر است. */
async function closePool() {
  try {
    const pool = db.getPool();
    if (pool && typeof pool.end === 'function') await pool.end();
  } catch (e) { /* swallowed: intentional — e unused */ }
}
