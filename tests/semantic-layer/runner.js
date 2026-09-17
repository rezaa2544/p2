#!/usr/bin/env node
/**
 * tests/semantic-layer/runner.js
 * رانر یکپارچه تست‌های لایه معنایی آموزشی (P0-EI-01)
 */
'use strict';

const path = require('path');
const { execSync } = require('child_process');

const SUITES = [
  'attendance-rate.test.js',
  'chronic-absence.test.js',
  'grade-distribution.test.js',
  'learning-trend.test.js',
  'school-health.test.js',
  'learner-progress.test.js',
  'course-engagement.test.js',
  'assessment-semantics.test.js',
  'completion-semantics.test.js',
  'activity-summary.test.js',
  'longitudinal-timeline.test.js',
  'assessment-analytics.test.js',
  'query-builders.test.js',
  'mutations.test.js',
  'deterministic-and-mutation.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  Wave 21+ / Phase 3 — P0-EI-01 Educational Semantic Layer Gate  ');
console.log('═══════════════════════════════════════════════════════════════════\n');

let totalSuites = SUITES.length;
let passedSuites = 0;
let failedSuites = 0;

for (let i = 0; i < SUITES.length; i++) {
  const suiteFile = SUITES[i];
  const suitePath = path.join(__dirname, suiteFile);
  console.log(`[${i + 1}/${totalSuites}] اجرای سوئیت: ${suiteFile}`);
  try {
    const stdout = execSync(`node "${suitePath}"`, { stdio: 'pipe', encoding: 'utf-8' });
    process.stdout.write(stdout);
    passedSuites++;
  } catch (err) {
    console.error(`❌ شکست در سوئیت ${suiteFile}:`);
    console.error(err.stdout || '');
    console.error(err.stderr || '');
    failedSuites++;
  }
  console.log('');
}

console.log('───────────────────────────────────────────────────────────────────');
console.log(`نتیجه کلی لایه معنایی: ${passedSuites}/${totalSuites} سوئیت موفق`);

if (failedSuites > 0) {
  console.error(`❌ شکست در ${failedSuites} سوئیت.`);
  process.exit(1);
} else {
  console.log('✅ تمامی تست‌های لایه معنایی و آزمون‌های جهش با موفقیت ۱۰۰٪ پاس شدند.');
  process.exit(0);
}
