/* ═══════════════════════════════════════════════════════════════════
   server/outbox.js — P0-17: صندوق رویدادهای برون‌مرزی (Transactional Outbox)
   ───────────────────────────────────────────────────────────────────
   هر جهشِ مهم یک رویداد به `store.outbox` می‌افزاید؛ مصرف‌کننده‌ها
   (همگام‌سازی چندنمونه‌ای، بازسازی، حسابرسی) از روی آن پیش می‌روند.
   - نوشت، هم‌تراز با تغییرِ فروشگاه است (هر دو در یک اسنپ‌شات ذخیره
     می‌شوند) → رویداد گم نمی‌شود.
   - با پستگرسِ فعال، رویدادها در جدول `server_outbox` نیز می‌نشینند.
   - سقف ۱۰۰۰ رویداد: قدیمی‌ترها سر می‌خورند (صف، نه انبار).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const OUTBOX_CAP = 1000;

function createOutbox({ store, db }) {
  if (!Array.isArray(store.outbox)) store.outbox = [];

  const nextId = () => {
    store.__outbox_seq = (Number(store.__outbox_seq) || 0) + 1;
    return store.__outbox_seq;
  };

  /**
   * @param {object} event — { type, collection, record_id, actor_id, version, payload? }
   */
  async function append(event) {
    const evt = Object.assign({
      id: nextId(),
      at: new Date().toISOString()
    }, event);
    store.outbox.push(evt);
    if (store.outbox.length > OUTBOX_CAP) {
      store.outbox.splice(0, store.outbox.length - OUTBOX_CAP);
    }
    if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
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

  return { append, cap: OUTBOX_CAP };
}

module.exports = { createOutbox };
