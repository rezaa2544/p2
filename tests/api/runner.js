#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/runner.js — Production RESTful API Test Suite Runner
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_TESTS = [
  'bootstrap.test.js',
  'students.test.js',
  'classes.test.js',
  'attendance.test.js',
  'grades.test.js',
  'users.test.js',
  'cache.test.js',
  'quality-governance.test.js',
  'longitudinal-intelligence.test.js',
  'recommendation-action-planning.test.js',
  'feedback-learning-memory.test.js'
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🚀 اجرای آزمون‌های کامل RESTful API Backend (فاز ۳)');
console.log('═══════════════════════════════════════════════════════════════════\n');

let totalSuites = API_TESTS.length;
let passedSuites = 0;

for (const testFile of API_TESTS) {
  const fullPath = path.join(__dirname, testFile);
  try {
    const output = execSync(`node ${fullPath}`, { encoding: 'utf8' });
    console.log(output.trim());
    passedSuites++;
  } catch (err) {
    console.error(`❌ Suite failed: ${testFile}`);
    console.error(err.stdout || err.message);
    process.exit(1);
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log(`نتیجه کلی RESTful API Tests: ${passedSuites}/${totalSuites} سوئیت موفق — بدون خطا ✅`);
console.log('────────────────────────────────────────────────────');
