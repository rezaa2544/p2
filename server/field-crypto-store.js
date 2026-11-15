/* ═══════════════════════════════════════════════════════════════════
   server/field-crypto-store.js — سیم‌کشیِ رمز سطح-فیلد (M15-09) در
   مرزهایِ ماندگاری: persist/hydrateِ PG و snapshotِ JSON.
   ───────────────────────────────────────────────────────────────────
   سیاست:
   - بدونِ PAYESH_FIELD_ENC_KEYS = passthrough کامل (پیش‌فرضِ رفتارِ
     فعلی — هیچ سوئیت/مسیری تغییر نمی‌کند؛ فعال‌سازی فقط با کلید).
   - با کلید: فیلدهایِ حساسِ users (phone، national_id) در دیسک/PG به
     شکلِ envelope (payesh-fenc:v1:kid:...) می‌روند و روی هر مسیرِ
     خواندن باز می‌شوند؛ آینهٔ RAM همیشه plaintext می‌ماند.
   - fail-closed: envelope دستکاری‌شده/کلیدِ نایافتنی = خطا (هرگز
     plaintextِ نادرست) — روی بوت یعنی کرشِ بلند، روی خواندن یعنی رد.
   - پیش‌نیازِ مستند (field-crypto.js L18): جستجوی برابری روی فیلدِ
     رمزشده به ستونِ hash جداگانه نیاز دارد (migration آینده) — تا
     آن زمان فعال‌سازیِ کلید فقط با مهاجرتِ مسیرِ lookup انجام شود.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { createFieldCrypto, PREFIX } = require('./field-crypto');

const FIELD_CRYPTO = createFieldCrypto({ required: false }); /* بدونِ کلید = passthrough */
const ENC_FIELDS = { users: ['phone', 'national_id'] };

function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

/* همهٔ تصمیم‌ها از effectiveCrypto() — تا __setForTests روی مسیرهایِ
   سیم‌شده هم اثر کند (اثباتِ منفیِ سیم‌کشی). */
function cryptoNow() { return TEST_CRYPTO || FIELD_CRYPTO; }

/** کپیِ سطحیِ سطر با رمزشدنِ فیلدهایِ حساس (فقط مقدارِ اسکالرِ تازه) */
function encryptRowValues(col, row) {
  const fc = cryptoNow();
  const fields = ENC_FIELDS[col];
  if (!fields || !fc.isReady() || !row || typeof row !== 'object') return row;
  let changed = false;
  const out = {};
  for (const k of Object.keys(row)) out[k] = row[k];
  for (const f of fields) {
    const v = out[f];
    if (v != null && typeof v !== 'object' && !isEncrypted(String(v))) {
      out[f] = fc.encryptField(String(v));
      changed = true;
    }
  }
  return changed ? out : row;
}

/** کپیِ سطحیِ سطر با بازکردنِ فیلدهایِ حساس — fail-closed روی خرابی */
function decryptRowValues(col, row) {
  const fc = cryptoNow();
  const fields = ENC_FIELDS[col];
  if (!fields || !row || typeof row !== 'object') return row;
  let hit = false;
  for (const f of fields) { if (isEncrypted(row[f])) { hit = true; break; } }
  if (!hit) return row;
  const out = Object.assign({}, row);
  for (const f of fields) {
    if (isEncrypted(out[f])) out[f] = fc.decryptField(out[f]); /* خطا = بلند */
  }
  return out;
}

function encryptRows(col, rows) {
  if (!Array.isArray(rows)) return rows;
  if (!ENC_FIELDS[col] || !cryptoNow().isReady()) return rows;
  return rows.map((r) => encryptRowValues(col, r));
}

function decryptRows(col, rows) {
  if (!Array.isArray(rows)) return rows;
  if (!ENC_FIELDS[col]) return rows;
  return rows.map((r) => decryptRowValues(col, r));
}

/**
 * اسنپ‌شاتِ store برای نوشتنِ فایل: users با فیلدهایِ رمزشده —
 * storeِ اصلی (RAM) دست‌نخورده می‌ماند. بدونِ کلید = خودِ store.
 */
function storeSnapshotForPersist(store) {
  if (!store || typeof store !== 'object' || !cryptoNow().isReady() || !Array.isArray(store.users)) return store;
  const clone = Object.assign({}, store);
  clone.users = store.users.map((u) => encryptRowValues('users', u));
  return clone;
}

/* الگویِ db.__setPoolForTests — فقط برایِ اثباتِ منفی/آزمون؛
   null = بازگشت به نمونهٔ واقعیِ env-محور. */
let TEST_CRYPTO = null;
function __setForTests(fc) { TEST_CRYPTO = fc || null; }
function effectiveCrypto() { return TEST_CRYPTO || FIELD_CRYPTO; }

module.exports = { ENC_FIELDS, FIELD_CRYPTO, isEncrypted, encryptRowValues, decryptRowValues, encryptRows, decryptRows, storeSnapshotForPersist, __setForTests, effectiveCrypto };
