/**
 * tests/infrastructure/certification/layer-completeness.test.js
 * اعتبارسنجی کمال ۶ لایه بنیادین مقیاس‌پذیری و پایداری فاز ۴ (P1-SC-07)
 */

'use strict';

const assert = require('assert');
const {
  PHASE4_LAYER_ID,
  CANONICAL_PHASE4_CATALOG,
  validatePhase4LayerCompleteness
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون کمال ۶ لایه مقیاس‌پذیری فاز ۴ ---');

// ۱. بررسی تعداد و شناسه‌های رسمی لایه‌ها
const layerKeys = Object.keys(PHASE4_LAYER_ID);
assert.strictEqual(layerKeys.length, 6, 'باید دقیقاً ۶ لایه در فاز ۴ ثبت شده باشد');
assert.strictEqual(CANONICAL_PHASE4_CATALOG.length, 6, 'کاتالوگ رسمی باید دارای ۶ مدخل باشد');

// ۲. اعتبارسنجی کاتالوگ استاندارد پیش‌فرض
const defaultValidation = validatePhase4LayerCompleteness();
assert.strictEqual(defaultValidation.complete, true, 'کاتالوگ پیش‌فرض باید ۱۰۰٪ کامل باشد');
assert.strictEqual(defaultValidation.active_count, 6, 'باید هر ۶ لایه در وضعیت ACTIVE باشند');
assert.strictEqual(defaultValidation.missing_layers.length, 0, 'نباید هیچ لایه ناموجودی وجود داشته باشد');
assert.strictEqual(defaultValidation.dependency_errors.length, 0, 'زنجیره وابستگی‌ها باید کاملاً بسته باشد');

// ۳. کشف لایه ناقص در صورت حذف یک عضو
const incompleteCatalog = CANONICAL_PHASE4_CATALOG.filter(
  l => l.layer_id !== PHASE4_LAYER_ID.SC_06_ZERO_TRUST_SECURITY
);
const incompleteResult = validatePhase4LayerCompleteness(incompleteCatalog);
assert.strictEqual(incompleteResult.complete, false, 'کاتالوگ فاقد لایه ۶ باید ناقص گزارش شود');
assert.strictEqual(incompleteResult.missing_layers.length, 1);
assert.strictEqual(incompleteResult.missing_layers[0], PHASE4_LAYER_ID.SC_06_ZERO_TRUST_SECURITY);

// ۴. کشف خطای وابستگی در صورت وجود وابستگی نامعتبر
const brokenDepCatalog = [
  ...CANONICAL_PHASE4_CATALOG,
  {
    layer_id: 'P1-SC-99-Broken',
    name: 'لایه خراب',
    contract_version: '1.0.0',
    status: 'ACTIVE',
    dependencies: ['NON_EXISTENT_LAYER']
  }
];
const brokenDepResult = validatePhase4LayerCompleteness(brokenDepCatalog);
assert.strictEqual(brokenDepResult.complete, false);
assert.ok(brokenDepResult.dependency_errors.length > 0, 'باید خطای وابستگی نامعتبر ثبت گردد');

console.log('✅ ۱/۹: کمال ۶ لایه فاز ۴ و زنجیره وابستگی‌ها تایید شد');
