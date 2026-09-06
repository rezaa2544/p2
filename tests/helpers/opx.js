/**
 * opX — سازندهٔ عملیاتِ sync برای تست‌های سرور (دور ۷۰، بند ۱)
 *
 * چرا: تابعِ ترتیبیِ قدیمی `op(uid, c, t, id, data)` مرتبِ آرگومان‌های
 * c/t را چند بار جابه‌جا می‌گرفت و خطای گیج‌کنندهٔ `role_denied` می‌داد
 * (سرور `canWrite(role, op.c)` را می‌سنجید و c مقدارِ 'ins' بود!).
 * اینجا فقط شیء می‌گیریم — کلیدِ اشتباهی، بلافاصله throw می‌کند.
 *
 * نمونه:
 *   const { opX } = require('./helpers/opx');
 *   const op = opX({ by: mgr.id, collection: 'preapps', type: 'ins',
 *                    data: { school_id: 1, name: 'x', stage: 'contact' } });
 */
'use strict';
let seq = 0;
function opX(spec = {}) {
  const { by, collection, type, id = null, data = {}, uid } = spec;
  if (by == null) throw new Error('opX: by (شناسهٔ کاربر) لازم است');
  if (!collection) throw new Error('opX: collection لازم است');
  if (!type) throw new Error('opX: type (ins/upd/del) لازم است');
  if (!['ins', 'upd', 'del'].includes(type)) throw new Error('opX: type نامعتبر: ' + type);
  seq += 1;
  return {
    uid: uid || ('opx-' + process.pid + '-' + Date.now() + '-' + seq),
    c: collection,
    t: type,
    id: id == null ? null : id,
    data,
    by,
    at: new Date().toISOString(),
  };
}
module.exports = { opX };
