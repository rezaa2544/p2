#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/form-validation-ux.js — تست‌های اعتبارسنجی فرم و مرکز فرماندهی (C8-06, C8-13, C8-14)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const failures = [];

function chk(name, ok, extra) {
  if (ok) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  ❌ ' + name + (extra ? ' — ' + extra : ''));
  }
}

const ROOT = path.join(__dirname, '..');
const valModule = require(path.join(ROOT, 'src', 'js', '40-form-validation.js'));

console.log('■ ۱) آزمون‌های اعتبارسنجی شماره تلفن همراه (validatePhone)');
chk('شماره ۱۱ رقمی معتبر با پیش‌شماره ۰۹', valModule.validatePhone('09123456789') === true);
chk('شماره معتبر با ارقام فارسی', valModule.validatePhone('۰۹۱۲۳۴۵۶۷۸۹') === true);
chk('شماره معتبر با پیش‌شماره ۹۹۹', valModule.validatePhone('09990001234') === true);
chk('رد شماره با پیش‌شماره نامعتبر (۰۸)', valModule.validatePhone('08123456789') === false);
chk('رد شماره ۱۰ رقمی کوتاه', valModule.validatePhone('0912345678') === false);
chk('رد شماره ۱۲ رقمی بلند', valModule.validatePhone('091234567890') === false);
chk('رد ورودی غیرعددی', valModule.validatePhone('0912abc6789') === false);
chk('پذیرش مقدار خالی/اختیاری', valModule.validatePhone('') === true && valModule.validatePhone(null) === true);

console.log('\n■ ۲) آزمون‌های اعتبارسنجی کد ملی (validateNid)');
chk('کد ملی نمونه معتبر ۹۹۹۰۰۰۰۳۱۱', valModule.validateNid('9990000311') === true);
chk('کد ملی نمونه با ارقام فارسی ۹۹۹۰۰۰۰۳۱۱', valModule.validateNid('۹۹۹۰۰۰۰۳۱۱') === true);
chk('رد کد ملی نامعتبر ۱۲۳۴۵۶۷۸۹۰', valModule.validateNid('1234567890') === false);
chk('رد کد ملی با طول غیرمجاز', valModule.validateNid('12345') === false);
chk('پذیرش مقدار خالی/اختیاری', valModule.validateNid('') === true && valModule.validateNid(null) === true);

console.log('\n■ ۳) آزمون‌های اعتبارسنجی نمره (validateScore)');
chk('نمره معتبر صفر', valModule.validateScore('0') === true && valModule.validateScore(0) === true);
chk('نمره معتبر بیست', valModule.validateScore('20') === true && valModule.validateScore(20) === true);
chk('نمره اعشاری معتبر ۱۷.۵', valModule.validateScore('17.5') === true);
chk('نمره با ارقام فارسی ۱۸.۲۵', valModule.validateScore('۱۸.۲۵') === true);
chk('رد نمره منفی', valModule.validateScore('-1') === false);
chk('رد نمره بیشتر از ۲۰', valModule.validateScore('20.5') === false);
chk('رد متن نامعتبر', valModule.validateScore('عالی') === false);
chk('پذیرش مقدار خالی/اختیاری', valModule.validateScore('') === true && valModule.validateScore(null) === true);

console.log('\n■ ۴) شبیه‌سازی رفتار DOM برای اعتبارسنجی فوری و بازیابی خطا');
function createMockInput(id, val, dataset, required) {
  const classList = new Set();
  const fieldDiv = {
    children: [],
    querySelector(sel) {
      return this.children.find(c => c.className === sel.replace('.', '')) || null;
    },
    appendChild(node) { this.children.push(node); }
  };
  return {
    id,
    value: val,
    dataset: dataset || {},
    classList: {
      add(cls) { classList.add(cls); },
      remove(cls) { classList.delete(cls); },
      contains(cls) { return classList.has(cls); }
    },
    hasAttribute(attr) { return attr === 'required' ? !!required : false; },
    closest(sel) { return sel === '.field' ? fieldDiv : null; },
    _fieldDiv: fieldDiv
  };
}

// ۴.۱ فیلد الزامی خالی
const mockReq = createMockInput('test_req', '', {}, true);
const resReq = valModule.validateInput(mockReq);
chk('فیلد الزامی خالی اعتبارسنجی را رد می‌کند', resReq === false);

// ۴.۲ فیلد تلفن با شماره اشتباه
const mockPhone = createMockInput('u_phone', '0912', { validate: 'phone' }, false);
const resPhone = valModule.validateInput(mockPhone);
chk('شماره ناقص در فیلد تلفن رد می‌شود', resPhone === false);

// ۴.۳ فیلد نمره خارج از بازه
const mockScore = createMockInput('g_score', '25', { validate: 'score' }, false);
const resScore = valModule.validateInput(mockScore);
chk('نمره ۲۵ در فیلد نمره رد می‌شود', resScore === false);

// ۴.۴ بازیابی خطا (Recovery)
mockPhone.classList.add('has-error');
mockPhone.value = '09123456789';
valModule.recoverInput(mockPhone);
chk('بازیابی خطا: به‌محض اصلاح ورودی، کلاس has-error برداشته می‌شود', !mockPhone.classList.contains('has-error'));

console.log('\n■ ۵) بررسی ادغام کد و ساخت بیلد');
const bundlePath = path.join(ROOT, 'dist', 'payesh.html');
const bundleHtml = fs.readFileSync(bundlePath, 'utf8');
chk('تابع managerExceptionPanel در بیلد ادغام شده است', bundleHtml.includes('managerExceptionPanel'));
chk('تابع gradeDistributionCard در بیلد ادغام شده است', bundleHtml.includes('gradeDistributionCard'));
chk('ماژول اعتبارسنجی فرم در بیلد ادغام شده است', bundleHtml.includes('validatePhone') && bundleHtml.includes('recoverInput'));

console.log(`\n──────────────────────────────────────────`);
console.log(`نتیجه: ${pass} موفق / ${fail} ناموفق (از ${pass + fail})`);
if (fail > 0) {
  console.error('موارد ناموفق:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('✅ همه آزمون‌های UX اعتبارسنجی فرم و مرکز فرماندهی مدیر با موفقیت پاس شدند.');
process.exit(0);
