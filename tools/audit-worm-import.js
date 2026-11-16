'use strict';
/* tools/audit-worm-import.js — M15-05: تغذیهٔ جدولِ WORM audit از فایلِ
   append-only (server/audit.js) + راستی‌آزماییِ زنجیرهٔ hash.
   ───────────────────────────────────────────────────────────────────
   - migration: migrations/027_audit_worm.sql (REVOKE + trigger + hash chain)
   - حالت‌ها: (پیش‌فرض) import دیفرانسیل بر اساس seq · --verify = بازمحاسبهٔ
     زنجیره و کشفِ هر دستکاری · --dry = بدونِ نوشتن
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
  const lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n');
  const parsed = lines.map(parseLine).filter(Boolean);

  if (verifyOnly) {
    /* --verify: زنجیرهٔ جدول را از GENESIS بازمحاسبه کن */
    const res = await db.query('SELECT seq, payload, prev_hash, hash FROM audit_events_worm ORDER BY seq ASC');
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
    console.log('VERIFY: rows=' + res.rows.length + ' broken=' + broken);
    process.exit(broken ? 1 : 0);
  }

  /* import دیفرانسیل: از آخرین seqِ موجود در جدول */
  const cur = await db.query('SELECT COALESCE(MAX(seq), 0) AS m FROM audit_events_worm');
  if (!cur || !Array.isArray(cur.rows) || !cur.rows[0]) {
    console.error('PG_REQUIRED: این ابزار جدولِ WORM را در PostgreSQL می‌نویسد — DATABASE_URL تنظیم نیست (fail-closed).');
    process.exit(2);
  }
  const lastSeq = Number(cur.rows[0].m) || 0;
  let prevHash = GENESIS, imported = 0, skipped = 0, corrupt = 0;
  if (lastSeq > 0) {
    const h = await db.query('SELECT hash FROM audit_events_worm WHERE seq = $1', [lastSeq]);
    if (h.rows.length) prevHash = h.rows[0].hash;
  }
  for (const p of parsed) {
    if (p.corrupt) { corrupt++; continue; }
    if (p.seq == null || p.seq <= lastSeq) { skipped++; continue; }
    const hash = chainHash(prevHash, p.payload);
    if (!dry) {
      await db.query(
        'INSERT INTO audit_events_worm (seq, actor, action, payload, prev_hash, hash) VALUES ($1,$2,$3,$4::jsonb,$5,$6)',
        [p.seq, p.actor, p.action, JSON.stringify(p.payload), prevHash, hash]
      );
    }
    prevHash = hash;
    imported++;
  }
  console.log((dry ? 'DRY-RUN: ' : '') + 'imported=' + imported + ' skipped(<=lastSeq)=' + skipped + ' corrupt=' + corrupt);
  process.exit(0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
