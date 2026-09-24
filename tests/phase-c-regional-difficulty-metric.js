#!/usr/bin/env node
// tests/phase-c-regional-difficulty-metric.js — رگرسیونِ A-23
// average_difficulty_p_value یک عددِ ثابتِ تشریفاتی بود (۰.۶۲ وقتی آزمون
// هست، ۰.۶۵ وقتی نیست) — آماری که از هیچ داده‌ای مشتق نمی‌شد. اکنون نسبتِ
// واقعیِ آزمون‌هایِ دشوار است، و وقتی آزمونی نیست null (دادهٔ غایب پنهان
// نمی‌شود).
'use strict';

const assert = require('assert');
const { buildRegionalSnapshot } = require('../server/analytics/regional-intelligence-network');

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}

function snap(schools){
  return buildRegionalSnapshot({ regionId: 7, schools }, { requester: { role: 'superadmin' } });
}
function school(hard, total){
  return { school_id: 1, name: 'مدرسه',
    attendance_summary: { chronic_absence_rate: 5 },
    assessment_summary: { total_exams_analyzed: total, hard_exams_count: hard } };
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  console.log('▸ A-23 · سنجه از داده مشتق می‌شود، نه ثابت');
  {
    /* ۴ از ۵ آزمون دشوار ⇒ ۰.۸ */
    const s = snap([school(4, 5)]);
    const ap = s.assessment_patterns;
    chk('total_exams_surveyed شمارش واقعی', () => assert.strictEqual(ap.total_exams_surveyed, 5));
    chk('hard_exams_count شمارش واقعی', () => assert.strictEqual(ap.hard_exams_count, 4));
    chk('نسبتِ دشواری ۰.۸ است (نه ۰.۶۲ ثابت)',
      () => assert.strictEqual(ap.average_difficulty_p_value, 0.8, JSON.stringify(ap)));
  }
  {
    /* ۰ از ۱۰ دشوار ⇒ ۰ */
    const s = snap([school(0, 10)]);
    chk('هیچ آزمونِ دشواری نیست ⇒ ۰ (نه ۰.۶۲)',
      () => assert.strictEqual(s.assessment_patterns.average_difficulty_p_value, 0,
        JSON.stringify(s.assessment_patterns)));
  }
  {
    /* تجمعِ چند مدرسه */
    const s = snap([school(1, 4), school(3, 6)]);
    chk('تجمع: ۴ از ۱۰ ⇒ ۰.۴',
      () => assert.strictEqual(s.assessment_patterns.average_difficulty_p_value, 0.4,
        JSON.stringify(s.assessment_patterns)));
  }

  console.log('▸ A-23 · بدونِ داده: null (پنهان‌نکردن)');
  {
    const s = snap([school(0, 0), school(0, 0)]);
    chk('آزمونی نیست ⇒ null، نه ۰.۶۵ ثابت',
      () => assert.strictEqual(s.assessment_patterns.average_difficulty_p_value, null,
        JSON.stringify(s.assessment_patterns)));
    chk('total_exams_surveyed صفر است',
      () => assert.strictEqual(s.assessment_patterns.total_exams_surveyed, 0));
  }

  console.log('▸ A-23 · مقدار دیگر هرگز عددِ ثابتِ قدیمی نیست');
  {
    /* کلیدِ بازتولید: کدِ قدیمی برایِ هر دو حالت ۰.۶۲/۰.۶۵ برمی‌گرداند.
       هر مقدارِ واقعیِ مشتق‌شده، بسته به ورودی، تغییر می‌کند. */
    const withData = snap([school(2, 5)]).assessment_patterns.average_difficulty_p_value;
    const noData = snap([school(0, 0)]).assessment_patterns.average_difficulty_p_value;
    chk('دو ورودیِ متفاوت دو خروجیِ متفاوت می‌دهند (ثابت نیست)',
      () => assert.notStrictEqual(withData, noData, withData + ' === ' + noData));
    chk('هیچ‌کدام برابرِ ثابتِ قدیمی ۰.۶۲/۰.۶۵ نیست',
      () => { assert.ok(withData !== 0.62 && withData !== 0.65); assert.ok(noData !== 0.62 && noData !== 0.65); });
  }

  await Promise.all(checks);
  console.log('\n──────────────────────────────────────────');
  if (failures.length) {
    console.log('phase-c-regional-difficulty-metric: ' + pass + ' موفق، ' + failures.length + ' ناموفق');
    console.log('ناموفق‌ها: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('phase-c-regional-difficulty-metric: ' + pass + '/' + pass + ' موفق ✅');
}
