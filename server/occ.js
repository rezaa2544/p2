/* ═══════════════════════════════════════════════════════════════════
   server/occ.js — P0-18: کنترل همزمانی خوش‌بینانه (OCC)
   ───────────────────────────────────────────────────────────────────
   قراردادِ نوشت: کلاینت نسخهٔ پایه‌ای که دیده را با فیلدِ
   `base_version` (یا `version`) می‌فرستد؛ سرور فقط وقتی می‌پذیرد که
   آن نسخه با نسخهٔ جاری رکورد برابر باشد — وگرنه ۴۰۹ با نسخهٔ سرور.
   معادلِ `UPDATE ... WHERE id=$id AND version=$base` است: صفر ردیف ⇒
   برخورد. کلاینت‌های کهنه که نسخه نمی‌فرستند، مانند قبل می‌نویسند
   (سازگاری)، اما نسخهٔ رکورد باز هم بالا می‌رود تا کلاینت‌های دقیق
   از همان نقطه محافظت شوند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/**
 * @param {object} rec — رکورد جاری
 * @param {object} body — بدنهٔ درخواستِ به‌روزرسانی
 * @param {string} [entityLabel] — برای پیامِ فارسی
 * @param {boolean} [isVersioned=false] — الزام وجود base_version
 * @returns {null|object} تهی یعنی ادامه بده؛ وگرنه پاسخِ ۴۰۹/۴۰۰ آماده
 */
function checkOcc(rec, body, entityLabel, isVersioned = false) {
  const base = body && (body.base_version !== undefined ? body.base_version : body.version);
  const strictBaseVersion = process.env.PAYESH_STRICT_BASE_VERSION === '1' || process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production';
  if ((base === undefined || base === null || base === '') && isVersioned && strictBaseVersion) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'missing_base_version',
        message: (entityLabel || 'رکورد') + ' نیازمند base_version برای ویرایش است.'
      }
    };
  }
  if (base === undefined || base === null || base === '') return null; /* کلاینت کهنه غیر نسخه دار */
  if (typeof base !== 'number' || !Number.isSafeInteger(base) || base < 1) {
    return { status: 400, body: { ok: false, code: 'bad_base_version' } };
  }
  const serverVersion = Number(rec.version) || 1;
  if (Number(base) !== serverVersion) {
    return {
      status: 409,
      body: {
        ok: false,
        code: 'conflict',
        message: (entityLabel || 'رکورد') + ' توسط کاربر دیگری تغییر یافته است. صفحه را تازه کنید.',
        server_version: serverVersion
      }
    };
  }
  return null;
}

/** بالا بردن نسخهٔ رکورد پس از نوشتِ موفق */
function bump(rec) {
  rec.version = (Number(rec.version) || 1) + 1;
  rec.updated_at = new Date().toISOString();
  return rec.version;
}

/* Phase-2 remediation (BLOCKER 4): a rejected concurrent write is a REAL
   conflict and must be RECORDED in sync_conflicts (SSoT), no matter WHICH layer
   rejected it — the PG layer records rowCount=0 rejections inside the routes'
   catch blocks; this helper records the read-layer (checkOcc) rejections so
   EVERY 409 on a versioned PATCH lands in sync_conflicts. Best-effort: a
   recording failure never changes the 409 contract. */
async function recordRejectedConflict(ctx, { collection, rec, user, base, body }) {
  try {
    const store = ctx && ctx.store;
    const db = ctx && ctx.db;
    const ids = ctx && ctx.ids;
    const nowIso = new Date().toISOString();
    const cf = {
      id: ids ? await ids.nextId('sync_conflicts', (store && store.sync_conflicts) || []) : Date.now(),
      collection,
      record_id: rec && rec.id != null ? rec.id : null,
      school_id: rec && rec.school_id != null ? rec.school_id : null,
      user_id: user && user.id != null ? user.id : null,
      client_uid: null,
      base_version: base != null && base !== '' ? Number(base) : null,
      server_version: rec && rec.version != null ? Number(rec.version) : null,
      client_data: Object.assign({}, body || {}),
      server_state: Object.assign({}, rec || {}),
      incoming: { data: Object.assign({}, body || {}), by: user && user.id, at: nowIso },
      status: 'open',
      created_at: nowIso,
      updated_at: nowIso
    };
    if (store) {
      if (!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
      store.sync_conflicts.push(cf);
    }
    if (db && typeof db.persistOpsBatch === 'function') {
      await db.persistOpsBatch([{ c: 'sync_conflicts', t: 'ins', data: cf }]).catch(() => {});
    }
    return cf;
  } catch (e) { return null; }
}

module.exports = { checkOcc, bump, recordRejectedConflict };
