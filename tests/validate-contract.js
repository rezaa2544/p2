#!/usr/bin/env node
'use strict';

/* ═══════════════════════════════════════════════════════════════════
 * validate-contract — قراردادِ مستقیمِ لایهٔ اعتبارسنجیِ سرور (M15-06)
 * ───────────────────────────────────────────────────────────────────
 * server/validate.js تاکنون فقط به‌صورتِ غیرمستقیم (از راهِ endpointها)
 * پوشیده بود؛ این سوئیت هر اعتبارسنجِ صادرشده را مستقیم قفل می‌کند.
 *
 * قانونِ سبزِ کاذب — اثباتِ منفیِ دو-سمت: هر قرارداد هم «سمتِ پذیرش» و
 * هم «سمتِ رد» را ثابت می‌کند؛ لوس‌شدنِ regex/قاعده سمتِ رد را قرمز
 * می‌کند و سخت‌شدن سمتِ پذیرش را — هیچ جهشِ یک‌سویه سبز نمی‌ماند.
 * قراردادِ §4 (PII): پیام‌ها فقط نامِ فیلد/قاعده دارند، هرگز مقدارِ خام.
 * Cross-platform: بدون exec — فقط require.
 * ═══════════════════════════════════════════════════════════════════ */

const assert = require('assert');
const V = require('../server/validate');

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { passed++; return; }
  failed++;
  fails.push(name + (extra ? '  —  ' + extra : ''));
}

/* ── موبایلِ ایران: ۱۱ رقم با 09 (نرمال‌سازیِ فاصله/خط تیره) ── */
check('V1 موبایلِ سالم پذیرفته می‌شود', V.validPhone('09121234567') === true);
check('V2 موبایل با فاصله/خط‌تیره نرمال و پذیرفته', V.validPhone('0912 123-4567') === true);
check('V3 موبایلِ ۱۰-رقمی رد می‌شود (سمتِ رد)', V.validPhone('9121234567') === false);
check('V4 موبایلِ ۱۲-رقمی رد می‌شود (سمتِ رد)', V.validPhone('091212345678') === false);
check('V5 پیش‌شمارهٔ غیرِ 09 رد می‌شود', V.validPhone('08121234567') === false);
check('V6 ورودیِ عددی رد می‌شود (نوع‌محور)', V.validPhone(9121234567) === false);

/* ── تلفنِ ثابت: ۰ + ۹ تا ۱۰ رقم (فقطِ رقم‌ها با حذفِ جداکننده) ── */
check('V7 ثابتِ سالم پذیرفته', V.validLandline('02112345678') === true);
check('V8 ثابتِ ۹-رقمی (۰+۸ رقم) پذیرفته', V.validLandline('0211234567') === true);
check('V9 ثابتِ ۱۲-رقمی رد می‌شود', V.validLandline('021123456789') === false);

/* ── قراردادِ ورود: ‎+‎۹۸/۰-دسته هم می‌پذیرد ── */
check('V10 authphone با +98 پذیرفته', V.validAuthPhone('+989121234567') === true);
check('V11 authphoneِ بی‌پیش‌شمارهٔ ۱۱-رقمی پذیرفته', V.validAuthPhone('09121234567') === true);
check('V12 authphoneِ خیلی‌کوتاه رد می‌شود', V.validAuthPhone('0912123') === false);

/* ── کدِ ملی: دقیقاً ۱۰ رقمِ رشته‌ای ── */
check('V13 نیدِ سالم (رشتهٔ ۱۰ رقم) پذیرفته', V.validNid('1234567890') === true);
check('V14 نیدِ ۹-رقمی رد می‌شود', V.validNid('123456789') === false);
check('V15 نیدِ عددی (نه رشته) رد می‌شود', V.validNid(1234567890) === false);
check('V16 نیدِ حرف‌دار رد می‌شود', V.validNid('123456789a') === false);

/* ── کدِ OTP: ۴ تا ۶ رقم ── */
check('V17 کدِ ۴-رقمی پذیرفته', V.validOtpCode('1234') === true);
check('V18 کدِ ۶-رقمی پذیرفته', V.validOtpCode('123456') === true);
check('V19 کدِ ۳-رقمی رد می‌شود', V.validOtpCode('123') === false);
check('V20 کدِ ۷-رقمی رد می‌شود', V.validOtpCode('1234567') === false);

/* ── شناسه: int32ِ مثبت یا رشتهٔ همان (بدونِ ' 16'/'1e2'/'16.5') ── */
check('V21 شناسهٔ عددی پذیرفته', V.validId(16) === true);
check('V22 شناسهٔ رشته‌ای پذیرفته (گردشِ dataset)', V.validId('16') === true);
check('V23 صفر/منفی رد می‌شود', V.validId(0) === false && V.validId(-1) === false);
check('V24 اعشاری/نماد علمی/فاصله‌دار رد می‌شود',
  V.validId('16.5') === false && V.validId('1e2') === false && V.validId(' 16') === false);
check('V25 بیش از int32 رد می‌شود', V.validId('2147483648') === false);

/* ── تاریخِ YYYY-MM-DD با روزِ واقعی (کبیسه) ── */
check('V26 تاریخِ سالم پذیرفته', V.validYMD('1403-07-01') === true || V.validYMD('2026-11-14') === true);
check('V27 روزِ غیرموجود رد می‌شود (30 فوریه)', V.validYMD('2026-02-30') === false);
check('V28 ۲۹ فوریهٔ سالِ کبیسه پذیرفته', V.validYMD('2024-02-29') === true);
check('V29 ۲۹ فوریهٔ سالِ غیرکبیسه رد می‌شود', V.validYMD('2026-02-29') === false);
check('V30 قالبِ شکسته رد می‌شود', V.validYMD('2026-2-1') === false);

/* ── datetimeِ ISO + لغزشِ تاریخ را رد کند ── */
check('V31 ISOِ سالم پذیرفته', V.validDatetime('2026-11-14T10:00:00Z') === true);
check('V32 YYYY-MM-DD هم در datetime پذیرفته', V.validDatetime('2026-11-14') === true);
check('V33 ISOِ لغزنده (30 فوریه) رد می‌شود', V.validDatetime('2026-02-30T10:00:00Z') === false);
check('V34 سالِ بیرونِ بازه رد می‌شود', V.validDatetime('1899-01-01T00:00:00Z') === false);

/* ── موتورِ validate: fail-closedِ ناشناخته/الزامی/مقدار ── */
const ANN_SCHEMA = { fields: { title: { type: 'string', max: 100 }, status: { type: 'enum', values: ['open', 'closed'] } }, required: ['title'] };
check('V35 بدنهٔ غیرِ شیء رد می‌شود', V.validate(null, ANN_SCHEMA).ok === false && V.validate('x', ANN_SCHEMA).ok === false);
check('V36 فیلدِ ناشناخته رد می‌شود (kind=unknown_field)', (() => { const r = V.validate({ title: 'ا', hacker: 1 }, ANN_SCHEMA); return !r.ok && r.kind === 'unknown_field' && r.field === 'hacker'; })());
check('V37 الزامیِ خالی رد می‌شود (kind=missing)', (() => { const r = V.validate({ title: '' }, ANN_SCHEMA); return !r.ok && r.kind === 'missing' && r.field === 'title'; })());
check('V38 محمولهٔ سالم قبول (ok:true)', V.validate({ title: 'اطلاعیه', status: 'open' }, ANN_SCHEMA).ok === true);
check('V39 مقدارِ بیرونِ enum رد می‌شود', V.validate({ title: 'اطلاعیه', status: 'junk' }, ANN_SCHEMA).ok === false);

/* ── قراردادِ §4: پیام هرگز مقدارِ خام (PII) را برنمی‌گرداند ── */
(() => {
  const r = V.validate({ title: 'اطلاعیهٔ محرمانهٔ فلان‌بنیاد' }, { fields: { title: { type: 'phone' } }, required: ['title'] });
  check('V40 پیامِ خطا نامِ فیلد دارد نه مقدارِ خام', r.ok === false && !r.message.includes('محرمانه') && r.message.includes('title'), r.message);
})();

/* ── checkRule: score/time/array-of ── */
check('V41 score بیرونِ ۰-۲۰ رد می‌شود', V.checkRule(20.5, { type: 'score' }) === 'out_of_range' && V.checkRule(-1, { type: 'score' }) === 'out_of_range');
check('V42 score سالم قبول', V.checkRule(19.75, { type: 'score' }) === null);
check('V43 HH:MMِ سالم قبول و 24:00 رد', V.checkRule('07:45', { type: 'time' }) === null && V.checkRule('24:00', { type: 'time' }) === 'bad_time');
check('V44 آرایه با آیتمِ بد رد می‌شود (bad_item:*)', (() => { const r = V.checkRule([1, 'x'], { type: 'array', max: 10, of: { type: 'integer' } }); return typeof r === 'string' && r.startsWith('bad_item:'); })());
check('V45 نوعِ ناشناخته رد می‌شود (bad_type:*)', V.checkRule(1, { type: 'mongo' }) === 'bad_type:mongo');

/* ── ruleFor: enumِ مجموعه‌ها از STATUS_ENUMS می‌آید ── */
check('V46 statusِ attendance = enumِ مجموعه', (() => { const r = V.ruleFor('attendance', 'status'); return r.type === 'enum' && r.values.indexOf('late') > -1; })());
check('V47 مجموعهٔ بی‌enum: سقفِ ۳۲-نویسه‌ای', (() => { const r = V.ruleFor('unknown_coll', 'status'); return r.type === 'string' && r.max === 32; })());
check('V48 enumهایِ پایه صادر و غیرخالی', V.STATUS_ENUMS.users.indexOf('active') > -1 && V.USER_ROLES.indexOf('manager') > -1 && V.SCHOOL_GENDERS.length === 3);

if (failed > 0) {
  console.error(`validate-contract: ${passed} passed, ${failed} FAILED`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exitCode = 1;
} else {
  console.log(`validate-contract: ${passed} passed, 0 failed`);
}
