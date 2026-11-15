'use strict';
/* tests/m15-04-abac-wiring.js — M15-04: سیم‌کشیِ لایهٔ ABAC به دروازهٔ
   عملیاتِ sync (server/sync.js fieldGate) — follow-upِ ردیفِ ۲۴ صف.

   W1  مسیرِ عادی defer: نوشتنِ grades بدونِ قاعدهٔ منطبق = عبور از ABAC
       و تصمیمِ RBAC (رفتارِ پیشین دست‌نخورده).
   W2  deny در مسیرِ واقعی: درجِ exam با «امتحان نهایی» = ردِ عملیات‌محور
       (code=abac_denied، الگوی ۲۰۰+ok:false، کل دسته نمی‌میرد).
   W3  قاعدهٔ grade زنده می‌شود: کلاسِ پایه-۱۱ در store → درجِ نمره = رد
       (aba-01 با پایهٔ حل‌شده از کلاسِ هدف — نه از خودِ ردیفِ نمره).
   W4  همان صحنه با کلاسِ پایه-۹ = عبور (قاعده فقط پایه‌های ۱۰-۱۲ را می‌گیرد).
   W5  اثباتِ منفیِ سیم‌کشی: تبدیلِ aba-01 به allow در فایلِ سیاست + reload
       → همان صحنهٔ W3 عبور می‌کند — یعنی گیت واقعاً از فایل سیاست تغذیه
       می‌شود (نه یک deny هاردکد). فایل در finally بازگردانده می‌شود.
   W6  deny مطلق: «امتحان نهایی» حتی برای superadmin = رد (deny مقدم بر
       گذرِ tenant-scoping — مطابق فلسفهٔ deny-first موتور).
   W7  مجموعهٔ ناشناخته = unknown_collection پیش از ABAC (ترتیبِ گیت‌ها).
   W8  audit: هر deny با sync_field_gate ثبت می‌شود (قابلیتِ رسیدگی).

   Run: node tests/m15-04-abac-wiring.js */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../server/db.js');
const sync = require('../server/sync.js');
const { createSync, attach } = sync;
const { opX } = require('./helpers/opx');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const POLICY_FILE = path.join(__dirname, '..', 'authz', 'abac-policies.json');

function makeCtx(opts) {
  const o = opts || {};
  const audits = [];
  const store = {
    announcements: [],
    exams: [],
    grades: o.grades || [],
    classes: o.classes || [],
    users: [{ id: 5, role: 'manager', school_id: 1, full_name: 'M' }],
    __processed_uids: {}, __server_version: 0
  };
  const role = o.role || 'manager';
  const sid = (o.school_id != null) ? o.school_id : 1;
  return {
    audits,
    store,
    ctx: {
      store, db: o.dbFake || {
        persistOpsBatch: async (ops) => ({ ok: true, driver: 'memory', count: ops.length }),
        isUidProcessed: async () => false
      },
      MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
      audit: (ev, d) => audits.push({ ev, d }),
      sessionFrom: () => ({ id: 5, role, school_id: sid }),
      sendJson: (res, code, body) => { res._cap = { code, body }; },
      markDirty: () => {}
    }
  };
}

async function runOps(storeObj, ctxObj, ops) {
  attach(storeObj);
  const s = createSync(ctxObj);
  const res = {};
  await s.apiSync({}, res, { ops });
  return (res._cap && res._cap.body && res._cap.body.results) || [];
}

(async () => {
  console.log('\n▸ M15-04 — سیم‌کشیِ ABAC به دروازهٔ sync');

  /* W0 — فایلِ سیاستِ منتخب بارگذاری می‌شود و گیتِ سیم‌شده همان است */
  chk('W0a نمونهٔ ABAC سیم‌شده در دسترس است (برایِ reload)', sync.__abac && typeof sync.__abac.reload === 'function');
  chk('W0b سیاستِ منتخب ≥ ۴ قاعده', sync.__abac.policyCount() >= 4, String(sync.__abac.policyCount()));

  /* W1 — مسیرِ عادی: درجِ نمره بدونِ کلاس = defer به RBAC (مدیر مجاز) */
  {
    const m = makeCtx({});
    const rs = await runOps(m.store, m.ctx, [opX({
      uid: 'w1-1', by: 5, collection: 'grades', type: 'ins',
      user_id: 5, school_id: 1, data: { school_id: 1, student_id: 10, score: 19 }
    })]);
    chk('W1a درجِ عادیِ نمره = ok (defer → RBAC)', rs.length === 1 && rs[0].ok === true, JSON.stringify(rs[0]));
    chk('W1b کدِ abac_denied ثبت نشد', rs[0].code !== 'abac_denied');
  }

  /* W2 — deny در مسیرِ واقعی: نمره با exam_type «امتحان نهایی» = ردِ
     عملیات‌محور (نوعِ آزمون روی ردیفِ grades است، نه exams) */
  {
    const m = makeCtx({});
    const rs = await runOps(m.store, m.ctx, [
      opX({ uid: 'w2-1', by: 5, collection: 'grades', type: 'ins', user_id: 5, school_id: 1,
        data: { school_id: 1, student_id: 10, score: 19, exam_type: 'امتحان نهایی' } }),
      opX({ uid: 'w2-2', by: 5, collection: 'grades', type: 'ins', user_id: 5, school_id: 1,
        data: { school_id: 1, student_id: 10, score: 18, exam_type: 'کلاسی' } })
    ]);
    chk('W2a نمرهٔ «امتحان نهایی» = رد با abac_denied', rs[0] && rs[0].ok === false && rs[0].code === 'abac_denied', JSON.stringify(rs[0]));
    chk('W2b نمرهٔ «کلاسی» در همان دسته = ok (کل دسته نمی‌میرد)', rs[1] && rs[1].ok === true, JSON.stringify(rs[1]));
    chk('W2c deny در audit ثبت شد', m.audits.some(a => a.ev === 'sync_field_gate' && a.d && a.d.code === 'abac_denied'));
  }

  /* W3/W4 — قاعدهٔ پایه از کلاسِ هدف حل می‌شود */
  {
    const m3 = makeCtx({ classes: [{ id: 1, school_id: 1, name: 'یازدهم', grade: 11 }] });
    const rs3 = await runOps(m3.store, m3.ctx, [opX({
      uid: 'w3-1', by: 5, collection: 'grades', type: 'ins',
      user_id: 5, school_id: 1, data: { school_id: 1, student_id: 10, class_id: 1, score: 19 }
    })]);
    chk('W3 درجِ نمره برایِ کلاسِ پایه-۱۱ = رد (aba-01 زنده)', rs3[0] && rs3[0].ok === false && rs3[0].code === 'abac_denied', JSON.stringify(rs3[0]));

    const m4 = makeCtx({ classes: [{ id: 2, school_id: 1, name: 'نهم', grade: 9 }] });
    const rs4 = await runOps(m4.store, m4.ctx, [opX({
      uid: 'w4-1', by: 5, collection: 'grades', type: 'ins',
      user_id: 5, school_id: 1, data: { school_id: 1, student_id: 10, class_id: 2, score: 19 }
    })]);
    chk('W4 همان عملیات با کلاسِ پایه-۹ = ok', rs4[0] && rs4[0].ok === true, JSON.stringify(rs4[0]));
  }

  /* W5 — اثباتِ منفیِ سیم‌کشی: فایلِ سیاست → reload → رفتار عوض می‌شود */
  {
    const original = fs.readFileSync(POLICY_FILE, 'utf8');
    let mutatedOk = null;
    try {
      const pol = JSON.parse(original);
      const r1 = pol.find((p) => p.id === 'aba-01');
      assert(r1, 'aba-01 در سیاست هست');
      r1.effect = 'allow';
      fs.writeFileSync(POLICY_FILE, JSON.stringify(pol, null, 2), 'utf8');
      sync.__abac.reload();
      const m = makeCtx({ classes: [{ id: 1, school_id: 1, name: 'یازدهم', grade: 11 }] });
      const rs = await runOps(m.store, m.ctx, [opX({
        uid: 'w5-1', by: 5, collection: 'grades', type: 'ins',
        user_id: 5, school_id: 1, data: { school_id: 1, student_id: 10, class_id: 1, score: 19 }
      })]);
      mutatedOk = rs[0] && rs[0].ok === true;
      chk('W5 جهشِ deny→allow در فایل = عبورِ همان صحنهٔ W3 (سیم‌کشی واقعی)', mutatedOk === true, JSON.stringify(rs[0]));
    } catch (e) {
      chk('W5 جهشِ سیاست اجرا شد', false, e && e.message);
    } finally {
      fs.writeFileSync(POLICY_FILE, original, 'utf8');
      sync.__abac.reload();
    }
    chk('W5b فایلِ سیاست بازگردانده شد', fs.readFileSync(POLICY_FILE, 'utf8') === original);
    /* پس از بازگردانی، دوباره رد می‌شود (هیچ حالتِ چسبیده‌ای نمانده) */
    const m = makeCtx({ classes: [{ id: 1, school_id: 1, name: 'یازدهم', grade: 11 }] });
    const rs = await runOps(m.store, m.ctx, [opX({
      uid: 'w5-2', by: 5, collection: 'grades', type: 'ins',
      user_id: 5, school_id: 1, data: { school_id: 1, student_id: 10, class_id: 1, score: 19 }
    })]);
    chk('W5c پس از بازگردانی = دوباره رد', rs[0] && rs[0].ok === false && rs[0].code === 'abac_denied', JSON.stringify(rs[0]));
  }

  /* W6 — deny مطلق: حتی superadmin نمرهٔ «امتحان نهایی» نمی‌تواند بزند */
  {
    const m = makeCtx({ role: 'superadmin', school_id: null });
    const rs = await runOps(m.store, m.ctx, [opX({
      uid: 'w6-1', by: 5, collection: 'grades', type: 'ins',
      user_id: 5, school_id: 1, data: { school_id: 1, student_id: 10, score: 20, exam_type: 'امتحان نهایی' }
    })]);
    chk('W6 superadmin هم برایِ نمرهٔ «امتحان نهایی» رد می‌شود', rs[0] && rs[0].ok === false && rs[0].code === 'abac_denied', JSON.stringify(rs[0]));
  }

  /* W7 — مجموعهٔ ناشناخته پیش از ABAC رد می‌شود (ترتیبِ گیت‌ها) */
  {
    const m = makeCtx({});
    const rs = await runOps(m.store, m.ctx, [opX({
      uid: 'w7-1', by: 5, collection: 'no_such_coll', type: 'ins',
      user_id: 5, school_id: 1, data: { school_id: 1 }
    })]);
    chk('W7 مجموعهٔ ناشناخته = unknown_collection', rs[0] && rs[0].ok === false && rs[0].code === 'unknown_collection', JSON.stringify(rs[0]));
  }

  /* W8 — حذف: بدونِ قاعدهٔ delete = defer به RBAC (مدیر مجاز) */
  {
    const m = makeCtx({ grades: [{ id: 77, school_id: 1, student_id: 10, score: 12 }] });
    const rs = await runOps(m.store, m.ctx, [opX({
      uid: 'w8-1', by: 5, collection: 'grades', type: 'del',
      user_id: 5, school_id: 1, id: 77
    })]);
    chk('W8 del بدونِ قاعده = defer → ok', rs[0] && rs[0].ok === true, JSON.stringify(rs[0]));
  }

  console.log('────────────────────────────────────────────');
  console.log('m15-04-abac-wiring: ' + okc + ' pass / ' + failc + ' fail');
  console.log('CHECKS ' + (okc + failc) + ' FAIL ' + failc);
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e && e.message)); process.exit(1); });
