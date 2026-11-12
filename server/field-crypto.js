/* ═══════════════════════════════════════════════════════════════════
   server/field-crypto.js — رمزنگاری سطح-فیلد AES-256-GCM (M15-09)
   ───────────────────────────────────────────────────────────────────
   هدف: دادهٔ حساس tenant (nid/phone) در حالتِ سکون رمز باشند — جدا از
   رمزنگاریِ بکاپِ DR (server/dr.js کل snapshot را می‌پوشاند؛ اینجا
   فیلد-به-فیلد است تا در store/PG بدونِ کلید خوانده نشود).

   کلیدها: env —
     PAYESH_FIELD_ENC_KEYS = "<kid1>:<base64-32B>,<kid2>:<base64-32B>"
     PAYESH_FIELD_ENC_KID  = کلیدِ فعال برای رمزکردن (پیش‌فرض = اولین)
   چرخش (SI-013): کلیدِ تازه به نقشه اضافه می‌شود، KID فعال عوض می‌شود؛
   ردیف‌های قدیمی با kid خودشان هنوز باز می‌شوند (envelope حامل kid است).

   قالب ذخیره (envelope): payesh-fenc:v1:<kid>:<iv-b64>:<tag-b64>:<ct-b64>
   - AES-256-GCM (احرازِ یکپارچگی با auth tag)
   - fail-closed: کلیدِ ناموجود/کوتاه، دستکاریِ ciphertext، یا kid ناشناخته
     = خطا (هرگز plaintextِ نادرست برنمی‌گردد)
   - نکتهٔ امنیتی: برای جستجوی برابری (lookup بر اساس phone) این ماژول
     مقدارِ ذخیره‌شده را رمز می‌کند نه index‌پذیر؛ جستجو = ستون hash جدا.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');

const PREFIX = 'payesh-fenc:v1:';

function parseKeys() {
  const raw = String(process.env.PAYESH_FIELD_ENC_KEYS || process.env.PAYESH_FIELD_ENC_KEY || '').trim();
  const map = new Map();
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf(':');
    if (i <= 0) continue;
    const kid = t.slice(0, i).trim();
    const keyB64 = t.slice(i + 1).trim();
    const key = Buffer.from(keyB64, 'base64');
    if (key.length === 32) map.set(kid, key);
  }
  return map;
}

function createFieldCrypto(opts) {
  const optsObj = opts || {};
  const keys = parseKeys();
  const required = optsObj.required !== false; /* پیش‌فرض: الزامی */

  function activeKid() {
    const want = String(process.env.PAYESH_FIELD_ENC_KID || '').trim();
    if (want && keys.has(want)) return want;
    return keys.keys().next().value || null;
  }

  function assertReady() {
    if (keys.size === 0) {
      if (required) {
        const err = new Error('FIELD_CRYPTO_KEY_MISSING: encryption-at-rest key not configured (fail-closed)');
        err.code = 'FIELD_CRYPTO_KEY_MISSING';
        throw err;
      }
      return false;
    }
    return true;
  }

  /** رمز کردنِ مقدار — خروجی envelope رشته‌ای */
  function encryptField(plain) {
    if (!assertReady()) return String(plain); /* فقط وقتی صریحاً required=false */
    const kid = activeKid();
    const key = keys.get(kid);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + kid + ':' + iv.toString('base64') + ':' + tag.toString('base64') + ':' + ct.toString('base64');
  }

  /** باز کردنِ envelope؛ ورودیِ غیر-envelope دست‌نخورده برمی‌گردد (backcompat) */
  function decryptField(value) {
    const s = String(value == null ? '' : value);
    if (!s.startsWith(PREFIX)) return s;
    const parts = s.slice(PREFIX.length).split(':');
    if (parts.length !== 4) {
      const err = new Error('FIELD_CRYPTO_BAD_ENVELOPE');
      err.code = 'FIELD_CRYPTO_BAD_ENVELOPE';
      throw err;
    }
    const kid = parts[0];
    const key = keys.get(kid);
    if (!key) {
      const err = new Error('FIELD_CRYPTO_UNKNOWN_KID: encrypted value uses key id not present in key map — rotation incomplete');
      err.code = 'FIELD_CRYPTO_UNKNOWN_KID';
      throw err;
    }
    try {
      const iv = Buffer.from(parts[1], 'base64');
      const tag = Buffer.from(parts[2], 'base64');
      const ct = Buffer.from(parts[3], 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch (e) {
      const err = new Error('FIELD_CRYPTO_DECRYPT_FAILED: tamper or wrong key (auth tag mismatch)');
      err.code = 'FIELD_CRYPTO_DECRYPT_FAILED';
      throw err;
    }
  }

  return {
    encryptField,
    decryptField,
    isReady: () => keys.size > 0,
    activeKid: () => (keys.size ? activeKid() : null),
    keyCount: () => keys.size
  };
}

module.exports = { createFieldCrypto, PREFIX };
