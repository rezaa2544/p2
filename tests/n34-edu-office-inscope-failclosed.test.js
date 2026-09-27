#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n34-edu-office-inscope-failclosed.test.js — N-34 regression guard
   -------------------------------------------------------------------
   N-34 (شدت: LOW، پتانسیلِ fail-openِ خاموش): policy.inScope برایِ
   نقشِ edu_office رویِ کالکشن‌هایِ خارج از EO_SCOPE_GATED یک
   «return true» بی‌قیدوشرط داشت. توجیهِ نوشته‌شده «اختیارِ بین‌مدرسه‌ای»
   بود — ولی در عمل یعنی ادارهٔ منطقه‌ایِ کردستان می‌توانست رکوردِ
   مدرسه‌ای در تهران را بنویسد. مسیرِ خواندن (readOk) درست کار می‌کرد
   (schoolInOfficeScope الزام می‌شد) — فقط مسیرِ نوشتن باز بود.

   اصلاح: کالکشن‌هایِ غیرگیت‌شده هم در محدودهٔ هندسهٔ دفتر مهار
   می‌شوند؛ رکوردِ بی‌مهارِ حل‌نشدنی ⇒ رد (fail-closed).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n34-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

const { store } = require('../server/index.js');
const policy = require('../server/policy.js');

let pass = 0, fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ✅ ' + name);
  } catch (err) {
    fail++;
    console.error('  ❌ ' + name + '\n     ' + err.message);
  }
}

async function main() {
  const eo = store.users.find(u => u.role === 'edu_office' && u.office_id === 1);
  assert.ok(eo, 'دادهٔ نمونه edu_office ادارهٔ ۱ نیست');

  /* مدرسهٔ ۱ در استان کردستان (پوششِ ادارهٔ ۱)؛ مدرسهٔ ۳ در استان ۲. */
  const schoolIn = store.schools.find(s => s.id === 1);
  const schoolOut = store.schools.find(s => s.province_id !== schoolIn.province_id);
  assert.ok(schoolIn && schoolOut, 'باید مدرسهٔ داخل و بیرونِ محدوده باشد');

  console.log('\n🔍 N-34: edu_office inScope is region-scoped, fail-closed');
  console.log('   ادارهٔ ۱ (office_id=1) | مدرسهٔ داخل: ' + schoolIn.id + ' | مدرسهٔ بیرون: ' + schoolOut.id);

  /* N34-1 — مانیفستِ خطا: یک کالکشنِ غیرگیت‌شده (مثلاً classes) نباید
     برایِ مدرسهٔ خارج از محدوده true بدهد. */
  test('N34-1: non-gated collection record of an out-of-region school is rejected', () => {
    const r = policy.inScope(eo, store, 'classes', null, { school_id: schoolOut.id, title: 'تزریق' });
    assert.strictEqual(r, false, 'نباید اجازهٔ نوشتن در مدرسهٔ خارج از منطقه را بدهد');
  });

  /* N34-2 — کنترلِ مثبت: مدرسهٔ داخلِ محدوده همچنان مجاز است (اصلاح
     نباید دامنهٔ مشروع را تنگ کند). */
  test('N34-2: non-gated collection record of an in-region school is allowed', () => {
    const r = policy.inScope(eo, store, 'classes', null, { school_id: schoolIn.id, title: 'کلاسِ مشروع' });
    assert.strictEqual(r, true, 'مدرسهٔ داخلِ محدوده باید مجاز باشد');
  });

  /* N34-3 — رکوردی که از طریقِ user_id به مدرسه‌ای خارج از محدوده
     اشاره می‌کند هم مهار می‌شود. */
  test('N34-3: records keyed by user_id resolve through the user\'s school', () => {
    const outUser = store.users.find(u => u.school_id === schoolOut.id);
    assert.ok(outUser, 'کاربرِ مدرسهٔ بیرون یافت نشد');
    const r = policy.inScope(eo, store, 'assets', null, { user_id: outUser.id, name: 'دارایی' });
    assert.strictEqual(r, false, 'نباید از طریقِ user_id به مدرسهٔ بیرون نفوذ کند');
    const inUser = store.users.find(u => u.school_id === schoolIn.id && u.role === 'manager');
    const r2 = policy.inScope(eo, store, 'assets', null, { user_id: inUser.id, name: 'دارایی' });
    assert.strictEqual(r2, true, 'کاربرِ داخلِ محدوده باید مجاز باشد');
  });

  /* N34-4 — رکوردِ کاملاً بی‌مهار (نه school_id، نه office_id) نباید
     قبول شود — این خودِ حفرهٔ اصلی بود (return true). */
  test('N34-4: an unresolvable unscoped record is rejected (fail-closed)', () => {
    const r = policy.inScope(eo, store, 'assets', null, { name: 'داراییِ بی‌مهار' });
    assert.strictEqual(r, false, 'رکوردِ بی‌مهار باید رد شود (قبلاً return true بود)');
  });

  /* N34-5 — رکوردِ سطحِ اداره با office_idِ خودِ اداره مجاز است و
     office_idِ ادارهٔ دیگر رد می‌شود (حفظِ رفتارِ مشروع). */
  test('N34-5: office-level records honor office_id matching', () => {
    const rOk = policy.inScope(eo, store, 'assets', null, { office_id: eo.office_id, name: 'داراییِ اداره' });
    assert.strictEqual(rOk, true, 'office_id خودِ اداره باید مجاز باشد');
    const rBad = policy.inScope(eo, store, 'assets', null, { office_id: 999, name: 'داراییِ ادارهٔ دیگر' });
    assert.strictEqual(rBad, false, 'office_id ادارهٔ دیگر باید رد شود');
  });

  /* N34-6 — کالکشن‌هایِ gated که edu_office واقعاً به آن‌ها می‌نویسد
     نبایدunderd کننند (regression guard). */
  test('N34-6: gated collections still use their dedicated scope path', () => {
    /* announcements با office_idِ خودِ اداره ⇒ مجاز */
    const r = policy.inScope(eo, store, 'announcements', null, { office_id: eo.office_id, title: 'اطلاعیه' });
    assert.strictEqual(r, true);
    /* staff_posts مدرسهٔ داخل ⇒ مجاز */
    const r2 = policy.inScope(eo, store, 'staff_posts', null, { school_id: schoolIn.id, body: 'پست' });
    assert.strictEqual(r2, true);
    /* staff_posts مدرسهٔ بیرون ⇒ رد */
    const r3 = policy.inScope(eo, store, 'staff_posts', null, { school_id: schoolOut.id, body: 'پست' });
    assert.strictEqual(r3, false);
  });

  /* N34-7 — edu_officeِ بدونِ office_id (کاربرِ ناقص) به هیچ وجه نباید
     pass کند (fail-closed). */
  test('N34-7: an edu_office without office_id gets nothing', () => {
    const broken = Object.assign({}, eo);
    delete broken.office_id;
    const r = policy.inScope(broken, store, 'classes', null, { school_id: schoolIn.id, title: 'x' });
    assert.strictEqual(r, false, 'ادارهٔ بی‌دفتر نباید هیچ‌چیز را مجاز کند');
  });

  console.log(`\nN-34 edu_office inScope Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
