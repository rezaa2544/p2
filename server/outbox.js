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

  /* P0#2 (چندنمونه‌ای): id باید **سراسری** باشد — شمارندهٔ فرایندی، دو
     instance با PG مشترک را به idهایِ تکراری می‌رساند و INSERTِ
     `ON CONFLICT (id) DO NOTHING` رویداد را ساکت می‌ریزد. وقتی Redis زنده
     است (در production الزامی — P0-13) دنباله از `INCR` مشترک می‌آید
     (monotonic، بدون TTL — شمارندهٔ دنباله انقضا نمی‌خواهد). حالتِ بدون
     Redis (توسعهٔ تک‌نمونه‌ای) همان شمارندهٔ محلیِ پیشین است. */
  const redis = require('./redis');
  const OUTBOX_SEQ_KEY = 'payesh:outbox:seq';
  async function nextId() {
    try {
      if (typeof redis.isRedis === 'function' && redis.isRedis()) {
        const n = Number(await redis.incr(OUTBOX_SEQ_KEY));
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch (e) { /* Redis رفت: شمارندهٔ محلی (سازگاریِ توسعه) */ }
    store.__outbox_seq = (Number(store.__outbox_seq) || 0) + 1;
    return store.__outbox_seq;
  }

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
      /* PG-live: sequenceٔ پستگرس؛ وگرنه دنبالهٔ Redis مشترک (P0#2) یا محلی */
      id: pgSeq ? await nextPgId() : await nextId(),
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
    /* Phase-2 remediation (live finding): the insert is ON CONFLICT (id) DO
       NOTHING, so a desynced sequence (manual insert / restore / crash artifact)
       silently DROPPED the event — a deleted record then never reached the
       outbox at all (reproduced live: nextval restarted at 1 while ids 1,2
       existed). On a unique violation, take a fresh id and retry once. */
    const insertOnce = async (q) => {
      try { await q.query(outboxInsertSql, outboxParams(evt)); }
      catch (e) {
        if (e && e.code === '23505' && pgSeq) {
          evt.id = await nextPgId();
          await q.query(outboxInsertSql, outboxParams(evt));
        } else { throw e; }
      }
    };
    if (client) {
      await insertOnce(client); /* Wave1-W: داخل تراکنش */
      return evt;
    }
    if (isPg()) {
      try {
        await insertOnce(db);
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
    if (!evt) {
      /* P0 fix (Chat 2 remediation, found live in RT4): in PG-live after a
         restart the RAM queue is empty by design (F3) — but the row lives in
         server_outbox. mark() used to bail out silently here, so every event
         processed by the PG-backed worker stayed 'pending' in PostgreSQL and
         was re-replayed on every boot (live evidence: pending|0 after 12s,
         'replayed 1 pending event(s)' each boot). Land the mark on PG. */
      if (!isPg()) return null;
      patch = patch || {};
      try {
        await db.query(
          `UPDATE server_outbox SET status = $2, retry_count = $3, last_error = $4, processed_at = $5, processing_at = $6
           WHERE id = $1;`,
          [id, String(patch.status || 'pending'), Number(patch.retry_count) || 0,
           patch.last_error != null ? String(patch.last_error) : null,
           patch.processed_at || null, patch.processing_at || null]
        );
        return Object.assign({ id }, patch);
      } catch (e) { /* best-effort mirror — same contract as below */ }
      return null;
    }
    Object.assign(evt, patch || {});
    if (isPg()) {
      try {
        await db.query(
          `UPDATE server_outbox SET status = $2, retry_count = $3, last_error = $4, processed_at = $5, processing_at = $6
           WHERE id = $1;`,
          [evt.id, String(evt.status || 'pending'), Number(evt.retry_count) || 0,
           evt.last_error != null ? String(evt.last_error) : null,
           evt.processed_at || null, evt.processing_at || null]
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

  /**
   * F3 (chaos-drill #185) — بازپخشِ صف پس از کرش در PG-live:
   * store.outbox آینهٔ درون‌حافظه‌ای است و با restart خالی بوت می‌شود؛
   * pendingهای جدولِ server_outbox (که append آن‌ها را نوشته بود) هیچ
   * مصرف‌کننده‌ای نداشتند و برای همیشه pending می‌ماندند (کارِ باطل‌سازیِ
   * کش اجرا نمی‌شد). این متد آن‌ها را به store.outbox برمی‌گرداند تا
   * worker.tick همان مسیرِ همیشگی را برود (at-least-once پس از سقوط).
   * best-effort و idempotent: رویدادِ موجود در store دوباره اضافه نمی‌شود.
   */
  async function replayPendingFromPg() {
    if (!isPg()) return { ok: true, replayed: 0, driver: 'memory' };
    let rows = [];
    try {
      const leaseSeconds = Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) > 0 ? Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) : 60;
      const r = await db.query(
        `SELECT id, type, collection, record_id, actor_id, version, payload, created_at, retry_count, last_error
           FROM server_outbox
           WHERE status = 'pending'
              OR (status = 'processing' AND (processing_at IS NULL OR processing_at < NOW() - ($2 * INTERVAL '1 second')))
           ORDER BY id ASC LIMIT $1;`, [OUTBOX_CAP, leaseSeconds]);
      rows = (r && r.rows) || [];
    } catch (e) {
      return { ok: false, replayed: 0, error: String((e && e.message) || e).slice(0, 140) };
    }
    if (!Array.isArray(store.outbox)) store.outbox = [];
    const have = new Set(store.outbox.map((e) => Number(e.id)));
    let replayed = 0;
    for (const row of rows) {
      const id = Number(row.id);
      if (have.has(id)) continue;
      let payload = row.payload;
      if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (e) { /* عیناً */ } }
      store.outbox.push({
        id, type: row.type, collection: row.collection,
        record_id: row.record_id, actor_id: row.actor_id, version: row.version,
        payload, created_at: row.created_at, status: 'pending',
        processing_at: null,
        retry_count: Number(row.retry_count) || 0, last_error: row.last_error || null
      });
      replayed++;
    }
    return { ok: true, replayed, driver: 'postgres' };
  }

  /**
   * Step 10 (P2-NI-08): Poller with FOR UPDATE SKIP LOCKED
   * OUTBOX-002 remediation: Atomic claim CTE ensures that concurrent workers
   * cannot claim or double-process the same pending rows even when client=null.
   */
  async function fetchPendingBatch(batchSize = 50, client = null) {
    const limit = Math.min(500, Math.max(1, batchSize));
    if (isPg()) {
      if (client) {
        const leaseSeconds = Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) > 0 ? Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) : 60;
        const res = await client.query(
          `SELECT id, type, collection, record_id, actor_id, version, payload, retry_count, last_error
           FROM server_outbox
           WHERE status = 'pending'
              OR (status = 'processing' AND (processing_at IS NULL OR processing_at < NOW() - ($2 * INTERVAL '1 second')))
           ORDER BY id ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED;`,
          [limit, leaseSeconds]
        );
        return (res && res.rows) || [];
      }
      // Single-statement atomic claim using CTE + UPDATE ... RETURNING
      const q = db;
      const res = await q.query(
        `WITH claimed AS (
           SELECT id FROM server_outbox
           WHERE status = 'pending'
              OR (status = 'processing' AND (processing_at IS NULL OR processing_at < NOW() - ($2 * INTERVAL '1 second')))
           ORDER BY id ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE server_outbox o
         SET status = 'processing', processing_at = NOW()
         FROM claimed c
         WHERE o.id = c.id
         RETURNING o.id, o.type, o.collection, o.record_id, o.actor_id, o.version, o.payload, o.retry_count, o.last_error;`,
        [limit, Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) > 0 ? Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) : 60]
      );
      return (res && res.rows) || [];
    }
    // Memory mode: reclaim only stale processing claims; fresh claims remain owned.
    const leaseMs = (Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) > 0 ? Number(process.env.PAYESH_OUTBOX_LEASE_SECONDS) : 60) * 1000;
    const now = Date.now();
    const pending = (store.outbox || []).filter(e => e.status === 'pending' || (e.status === 'processing' && (!e.processing_at || now - Number(e.processing_at) >= leaseMs))).slice(0, limit);
    for (const e of pending) {
      e.status = 'processing';
      e.processing_at = Date.now();
    }
    return pending;
  }

  /**
   * Step 10: Route poisoned event to server_outbox_dlq
   */
  async function moveToDlq(evtOrId, errorMessage) {
    /* B3 (Phase-2 remediation directive): moveToDlq accepts a full event object
       OR a bare event id. With an id, the row is resolved first (SELECT ...
       WHERE id=$1 in PG / the RAM queue otherwise) and then transferred to the
       DLQ with the source row marked dead_letter. */
    let evt = evtOrId;
    if (evt == null || typeof evt !== 'object') {
      const wantId = Number(evtOrId);
      if (!Number.isFinite(wantId)) return null;
      if (isPg()) {
        try {
          const r = await db.query(
            `SELECT id, type, collection, record_id, actor_id, version, payload, retry_count, last_error
             FROM server_outbox WHERE id = $1;`, [wantId]);
          if (!r || !r.rows || !r.rows.length) return null;
          evt = r.rows[0];
        } catch (e) { return null; }
      } else {
        evt = (store.outbox || []).find((e) => Number(e.id) === wantId);
        if (!evt) return null;
      }
    }
    if (isPg()) {
      try {
        await db.query(
          `INSERT INTO server_outbox_dlq (outbox_id, type, collection, record_id, actor_id, version, payload, error_message, retry_count, failed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (outbox_id) DO NOTHING;`,
          [evt.id, evt.type, evt.collection, evt.record_id, evt.actor_id, evt.version, JSON.stringify(evt.payload), String(errorMessage), evt.retry_count || 5]
        );
        await mark(evt.id, { status: 'dead_letter', last_error: errorMessage });
        return { ok: true, id: evt.id, status: 'dead_letter', error_message: String(errorMessage) };
      } catch (e) {
        console.warn('[Outbox DLQ] Failed to write to DLQ:', e.message);
        return { ok: false, id: evt.id, error: e.message };
      }
    } else {
      if (!Array.isArray(store.outbox_dlq)) store.outbox_dlq = [];
      store.outbox_dlq.push(Object.assign({}, evt, { error_message: errorMessage, failed_at: new Date().toISOString() }));
      await mark(evt.id, { status: 'dead_letter', last_error: errorMessage });
      return { ok: true, id: evt.id, status: 'dead_letter', error_message: String(errorMessage) };
    }
  }

  return { append, mark, depth, replayPendingFromPg, fetchPendingBatch, moveToDlq, cap: OUTBOX_CAP };
}

module.exports = { createOutbox };
