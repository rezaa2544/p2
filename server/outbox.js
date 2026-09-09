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

  /* Wave 1: PG-live ids come from payesh_outbox_id_seq (migration 004) so two
     instances never collide; the local counter stays for memory mode and as the
     fallback if the sequence read fails (the PG mirror is best-effort; the
     store copy is the durability path, and ON CONFLICT DO NOTHING keeps a
     fallback-id collision from erroring). */
  async function nextPgId(){
    try{
      const r = await db.query("SELECT nextval('payesh_outbox_id_seq') AS id");
      const v = r && r.rows && r.rows[0] && Number(r.rows[0].id);
      if(Number.isFinite(v)) return v;
    }catch(e){ /* fall through to the local counter */ }
    return nextId();
  }

  const isPg = () => db && typeof db.isPostgres === 'function' && db.isPostgres();
  /** INSERT پستگرسِ رویداد — جدا تا در تراکنشِ فراخوان هم قابل‌استفاده باشد */
  const outboxInsertSql =
    `INSERT INTO server_outbox (id, type, collection, record_id, actor_id, version, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO NOTHING;`;
  const outboxParams = (evt) => [
    evt.id, String(evt.type || ''), String(evt.collection || ''),
    evt.record_id != null ? Number(evt.record_id) : null,
    evt.actor_id != null ? Number(evt.actor_id) : null,
    evt.version != null ? Number(evt.version) : null,
    evt.payload ? JSON.stringify(evt.payload) : null
  ];
  /**
   * @param {object} event — { type, collection, record_id, actor_id, version, payload? }
   * @param {object} [client] — Wave1-W: اگر داده شود، INSERT روی همان client
   *   (داخل تراکنشِ فراخوان) اجرا می‌شود و خطا می‌پردازد تا رول‌بک شود.
   */
  async function append(event, client) {
    const pgSeq = isPg() && db && typeof db.query === 'function';
    const evt = Object.assign({
      id: pgSeq ? await nextPgId() : nextId(),
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
    if (client) {
      await client.query(outboxInsertSql, outboxParams(evt)); /* Wave1-W: داخل تراکنش */
      return evt;
    }
    if (isPg()) {
      try {
        await db.query(outboxInsertSql, outboxParams(evt));
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

  return { append, mark, cap: OUTBOX_CAP };
}

module.exports = { createOutbox };
