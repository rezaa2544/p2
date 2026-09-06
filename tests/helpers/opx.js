/**
 * opX — سازندهٔ عملیاتِ sync برای تست‌های سرور (دور ۷۰، بند ۱؛ گسترش دور ۷۸)
 *
 * چرا: تابعِ ترتیبیِ قدیمی `op(uid, c, t, id, data)` مرتبِ آرگومان‌های
 * c/t را چند بار جابه‌جا می‌گرفت و خطای گیج‌کنندهٔ `role_denied` می‌داد
 * (سرور `canWrite(role, op.c)` را می‌سنجید و c مقدارِ 'ins' بود!).
 * اینجا فقط شیء می‌گیریم — کلیدِ اشتباهی، بلافاصله throw می‌کند.
 *
 * گسترش دور ۷۸: کلیدهایِ اضافیِ سطح‌بالا (مثل `user_id`/`school_id`/`at`
 * که قراردادِ صفِ همگام‌سازی روی خودِ op می‌خواهد) با `...extra` عبور
 * می‌کنند؛ `at`ِ صریح، پیش‌فرض را برمی‌زند.
 *
 * نمونه:
 *   const { opX } = require('./helpers/opx');
 *   const op = opX({ by: mgr.id, collection: 'preapps', type: 'ins',
 *                    data: { school_id: 1, name: 'x', stage: 'contact' } });
 */
'use strict';
let seq = 0;
function opX(spec = {}) {
  const { by, collection, type, id = null, data = {}, uid, ...extra } = spec;
  if (by == null) throw new Error('opX: by (شناسهٔ کاربر) لازم است');
  if (!collection) throw new Error('opX: collection لازم است');
  if (!type) throw new Error('opX: type (ins/upd/del) لازم است');
  if (!['ins', 'upd', 'del'].includes(type)) throw new Error('opX: type نامعتبر: ' + type);
  if (extra.t !== undefined) throw new Error('opX: کلیدِ t مستقیم نمی‌آید — type بدهید');
  if (extra.c !== undefined) throw new Error('opX: کلیدِ c مستقیم نمی‌آید — collection بدهید');
  seq += 1;
  return {
    uid: uid || ('opx-' + process.pid + '-' + Date.now() + '-' + seq),
    c: collection,
    t: type,
    id: id == null ? null : id,
    data,
    by,
    at: new Date().toISOString(),
    ...extra,
  };
}
module.exports = { opX };
