'use strict';
/* tools/backfill-field-encryption.js — M15-09: مهاجرتِ یک‌بارهٔ ردیف‌هایِ
   موجود users به فرمِ رمزِ سطح-فیلد (پیگیریِ مستندِ ردیفِ ۲۳ صف).
   ───────────────────────────────────────────────────────────────────
   - بدونِ PAYESH_FIELD_ENC_KEYS: خطا (fail-closed — هیچ ردیفی لمس نمی‌شود).
   - پیش‌فرض: DRY-RUN (فقط شمارش)؛ --apply = نوشتنِ واقعی.
   - ردیف‌هایِ از-قبل-رمز (envelope) دست‌نخورده می‌مانند — اجرایِ تکراری امن.
   - فیلدها: phone، national_id (ENC_FIELDS در field-crypto-store).
   - سازگاری: سطرِ plaintext باقی‌مانده روی مسیرِ خواندن passthrough است
     (field-crypto-store.decryptRowValues) — پس اجرایِ ناقص هم هرگز خطای
     خواندن نمی‌سازد؛ فقط رمزِ کامل‌تر.
   Run: node tools/backfill-field-encryption.js [--apply]
*/
'use strict';
const db = require('../server/db');
const fcs = require('../server/field-crypto-store');
const { PREFIX } = require('../server/field-crypto');

(async () => {
  if (!fcs.FIELD_CRYPTO.isReady()) {
    console.error('FIELD_CRYPTO_KEY_MISSING: PAYESH_FIELD_ENC_KEYS تنظیم نیست — backfill انجام نمی‌شود (fail-closed).');
    process.exit(2);
  }
  const apply = process.argv.indexOf('--apply') > -1;
  const rows = await db.readCollection('users');
  let already = 0, candidates = 0, missing = 0, updated = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const needs = [];
    for (const f of fcs.ENC_FIELDS.users) {
      const v = r[f];
      if (v == null || typeof v === 'object' || v === '') continue;
      if (String(v).indexOf(PREFIX) === 0) { already++; continue; }
      needs.push(f);
    }
    if (needs.length === 0) continue;
    candidates++;
    if (!apply) continue;
    const sets = needs.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
    const vals = needs.map((f) => fcs.encryptRowValues('users', { [f]: r[f] })[f]);
    try {
      const res = await db.query(`UPDATE "users" SET ${sets} WHERE id = $${needs.length + 1}`, vals.concat([Number(r.id)]));
      if (res && res.rowCount) updated += res.rowCount;
    } catch (e) {
      missing++;
      console.error('UPDATE failed for users#' + r.id + ': ' + (e && e.message));
    }
  }
  console.log('users total=' + rows.length + ' encrypted-fields-already=' + already +
    ' rows-to-encrypt=' + candidates + (apply ? ' updated=' + updated + ' failures=' + missing : ' (DRY-RUN — با --apply بنویس)'));
  process.exit(missing ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
