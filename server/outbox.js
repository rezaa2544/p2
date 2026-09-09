/* ═══════════════════════════════════════════════════════════════════
   server/outbox.js — P0-17 + ویو ۸: صندوق رویدادهای برون‌مرزی (Transactional Outbox)
   ───────────────────────────────────────────────────────────────────
   هر جهشِ مهم یک رویداد به `store.outbox` می‌افزاید؛ مصرف‌کننده‌ها
   (همگام‌سازی چندنمونه‌ای، بازسازی، حسابرسی، و کارگرِ ویو ۸) از روی آن
   پیش می‌روند.
   - نوشت، هم‌تراز با تغییرِ فروشگاه است (هر دو در یک اسنپ‌شات ذخیره
     می‌شوند) → رویداد گم نمی‌شود.
   - با پستگرسِ فعال، رویدادها در جدول `server_outbox` نیز می‌نشینند.
   - سقف ۱۰۰۰ رویداد: قدیمی‌ترها سر می‌خورند (صف، نه انبار).
   ویو ۸ — چرخهٔ عمر: هر رویداد با `status='pending'` ثبت می‌شود؛
   کارگر (`server/worker.js`) آن را پردازش و با `mark()` به
   'processed' یا (پس از سقف تلاش) 'failed' می‌برد. رویداد در شکست
   هرگز حذف نمی‌شود — فقط علامت می‌خورد.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const OUTBOX_CAP = 1000;

function createOutbox({ store, db }) {
  if (!Array.isArray(store.outbox)) store.outbox = [];

  const nextId = () => {
    store.__outbox_seq = (Number(store.__outbox_seq) || 0) + 1;
    return store.__outbox_seq;
  };

  const isPg = () => db && typeof db.isPostgres === 'function' && db.isPostgres();

  /**
   * @param {object} event — { type, collection, record_id, actor_id, version, payload? }
   */
  async function append(event) {
    const evt = Object.assign({
      id: nextId(),
      at: new Date().toISOString(),
      /* ویو ۸ — چرخهٔ عمر (سازگار با گذشته: رویدادهای قدیمی بدون وضعیت
         از دید کارگر حکمِ 'pending' دارند) */
      status: 'pending',
      retry_count: 0,
      processed_at: null,
      last_error: null
    }, event);
    store.outbox.push(evt);
    if (store.outbox.length > OUTBOX_CAP) {
      store.outbox.splice(0, store.outbox.length - OUTBOX_CAP);
    }
    if (isPg()) {
      try {
        await db.query(
          `INSERT INTO server_outbox (id, type, collection, record_id, actor_id, version, payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id) DO NOTHING;`,
          [evt.id, String(evt.type || ''), String(evt.collection || ''),
           evt.record_id != null ? Number(evt.record_id) : null,
           evt.actor_id != null ? Number(evt.actor_id) : null,
           evt.version != null ? Number(evt.version) : null,
           evt.payload ? JSON.stringify(evt.payload) : null]
        );
      } catch (e) { /* جدول در دسترس نیست — منبع حقیقت اسنپ‌شات است */ }
    }
    return evt;
  }

  /**
   * ویو ۸ — به‌روزرسانی وضعیت یک رویداد (توسط کارگر).
   * @param {number} id
   * @param {object} patch — { status?, retry_count?, last_error?, processed_at? }
   */
  async function mark(id, patch) {
    const evt = store.outbox.find(e => e.id === id);
    if (!evt) return null;
    Object.assign(evt, patch || {});
    if (isPg()) {
      try {
        await db.query(
          `UPDATE server_outbox SET status = $2, retry_count = $3, last_error = $4, processed_at = $5
           WHERE id = $1;`,
          [evt.id, String(evt.status || 'pending'), Number(evt.retry_count) || 0,
           evt.last_error != null ? String(evt.last_error) : null,
           evt.processed_at || null]
        );
      } catch (e) { /* آینهٔ پستگرس بهترین‌تلاش است — منبع حقیقت اسنپ‌شات است */ }
    }
    return evt;
  }

  /**
   * ویو ۱۴ — عمقِ صفِ ناهم‌زمان (queue depth) برای Observability.
   * برچسب‌ها از یک مجموعهٔ بسته می‌آیند (pending/processed/failed/legacy)
   * تا cardinality هرگز بی‌کران نشود. O(n) روی صفِ سقف‌دارِ ۱۰۰۰ —
   * فقط هنگامِ scrape فراخوانی می‌شود، نه در مسیرِ درخواست.
   * @returns {{ total: number, pending: number, processed: number, failed: number, legacy: number }}
   */
  function depth() {
    const d = { total: store.outbox.length, pending: 0, processed: 0, failed: 0, legacy: 0 };
    for (const e of store.outbox) {
      const s = e && e.status;
      if (s === 'pending') d.pending++;
      else if (s === 'processed') d.processed++;
      else if (s === 'failed') d.failed++;
      else d.legacy++;
    }
    return d;
  }

  return { append, mark, depth, cap: OUTBOX_CAP };
}

module.exports = { createOutbox };
