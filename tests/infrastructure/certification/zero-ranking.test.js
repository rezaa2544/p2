/**
 * tests/infrastructure/certification/zero-ranking.test.js
 * آزمون اسکن عمیق بازگشتی و تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee)
 */

'use strict';

const assert = require('assert');
const {
  PHASE4_ERRORS,
  assertZeroRanking,
  generatePhase4ReleaseCertificate,
  buildPhase4CertificationSnapshot
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون منع رتبه‌بندی رقابتی مدارس ---');

// ۱. ساختار داده پاک و منطبق با رویکرد ایپساتیو (رشد درون‌فردی)
const cleanData = {
  school_id: 101,
  growth_index: 85,
  improvement_rate: 12.4,
  zero_ranking_guarantee: true,
  evaluation_model: 'IPSATIVE'
};
assert.doesNotThrow(() => {
  assertZeroRanking(cleanData);
}, 'داده پاک نباید خطایی پرتاب کند');

// ۲. کشف کلید ممنوعه 'rank'
assert.throws(() => {
  assertZeroRanking({
    school_id: 101,
    rank: 1
  });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.ZERO_RANKING_VIOLATION);
  return true;
});

// ۳. کشف کلید ممنوعه 'ranking_score' در عمق شیء
assert.throws(() => {
  assertZeroRanking({
    report: {
      metrics: {
        ranking_score: 95
      }
    }
  });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.ZERO_RANKING_VIOLATION);
  return true;
});

// ۴. کشف واژه ممنوعه در آرایه رشته‌ها
assert.throws(() => {
  assertZeroRanking({
    tags: ['education', 'league_table', 'school']
  });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.ZERO_RANKING_VIOLATION);
  return true;
});

// ۵. کشف کلید 'best_school'
assert.throws(() => {
  assertZeroRanking({
    best_school: 105
  });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.ZERO_RANKING_VIOLATION);
  return true;
});

// ۶. اسکن گواهی رسمی و اسنپ‌شات نهایی
const cert = generatePhase4ReleaseCertificate();
assert.doesNotThrow(() => {
  assertZeroRanking(cert);
});

const snapshot = buildPhase4CertificationSnapshot(1, 1);
assert.doesNotThrow(() => {
  assertZeroRanking(snapshot);
});

console.log('✅ ۵/۹: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس با موفقیت تایید شد');
