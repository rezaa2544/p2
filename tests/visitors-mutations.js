#!/usr/bin/env node
/**
 * E.9 جهش‌کشی — «مدیریت مراجعین (visitors)»
 * 5 جهش هدفمند باید هرکدام توسط tests/visitors2.js کشته شوند:
 *  - M1 برداشتنِ گاردِ نقش از ثبت (دانش‌آموز ثبت می‌کند)
 *  - M2 برداشتنِ گاردِ مالکیتِ مدرسه از خروج (خروجِ بین‌مدرسه‌ای)
 *  - M3 برداشتنِ گاردِ خروجِ تکراری
 *  - M4 canAction: «vis-out» به دبیر داده شود
 *  - M5 برداشتنِ گاردِ نامِ اجباری
 *
 * اجرا:  node tests/visitors-mutations.js
 * زمان:  ~2 دقیقه (هر جهش = build + اجرای کامل تست)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILES = {
  visitors: path.join(ROOT, 'src/js/53-visitors.js'),
  authz: path.join(ROOT, 'src/js/30-authz.js'),
};
const src = {};
for (const k of Object.keys(FILES)) src[k] = fs.readFileSync(FILES[k], 'utf8');

const MUTS = [
  {
    file: 'visitors',
    name: 'M1 گاردِ نقش از ثبت برداشته شود (هر کسی ثبت کند)',
    bad: "  var wr = visitorWriteOk(u);\n  if(!wr.ok) return {ok:false, msg:wr.msg};\n  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};",
    mut: "  var wr = {ok:true};\n  if(!wr.ok) return {ok:false, msg:wr.msg};\n  if(!u.school_id) return {ok:false, msg:'مدرسهٔ فعالی مشخص نیست'};",
    expectFail: 'ثبتِ مراجعِ دانش‌آموز باید رد شود',
  },
  {
    file: 'visitors',
    name: 'M2 گاردِ مالکیتِ مدرسه از خروج برداشته شود',
    bad: "  if(v.school_id !== u.school_id)\n    return {ok:false, msg:'این مهمان متعلق به مدرسهٔ شما نیست'};",
    mut: "  if(false)",
    expectFail: 'خروجِ بین‌مدرسه‌ای باید رد شود',
  },
  {
    file: 'visitors',
    name: 'M3 گاردِ خروجِ تکراری برداشته شود',
    bad: "  if(visitorStatus(v)==='out') return {ok:false, msg:'خروج این مهمان قبلاً ثبت شده است'};",
    mut: "  if(false) return {ok:false, msg:'خروج این مهمان قبلاً ثبت شده است'};",
    expectFail: 'خروجِ دوم باید رد شود',
  },
  {
    file: 'authz',
    name: 'M4 «vis-out» به دبیر داده شود',
    bad: "  'vis-out':        ['manager','guard'],",
    mut: "  'vis-out':        ['manager','guard','teacher'],",
    expectFail: 'canAction("vis-out") برای دبیر باید false باشد',
  },
  {
    file: 'visitors',
    name: 'M5 گاردِ نامِ اجباری برداشته شود',
    bad: "  if(!name) return {ok:false, msg:'نام مهمان خالی است'};",
    mut: "  if(false) return {ok:false, msg:'نام مهمان خالی است'};",
    expectFail: 'ثبت با نامِ خالی باید رد شود',
  },
];

let killed = 0;
for (const m of MUTS) {
  if (src[m.file].split(m.bad).length !== 2) {
    console.log(`  ⚠️  ${m.name}: الگوی جهش پیدا نشد — کد عوض شده؟`);
    continue;
  }
  fs.writeFileSync(FILES[m.file], src[m.file].replace(m.bad, m.mut));
  try {
    execSync('node build.js', { stdio: 'pipe' });
  } catch (e) {
    console.log(`  ✅ ${m.name} (build شکست — کشته شد)`);
    killed++;
    continue;
  }
  let out;
  try {
    out = execSync('node tests/visitors2.js', { stdio: 'pipe', encoding: 'utf8' });
    console.log(`  ❌ ${m.name}: جهش زنده ماند!`);
  } catch (e) {
    out = (e.stdout || '') + String(e.message);
    if (out.includes('❌') && out.includes(m.expectFail)) {
      console.log(`  ✅ ${m.name} کشته شد`);
      killed++;
    } else {
      console.log(`  ⚠️  ${m.name}: کشته شد اما نه با پیامِ انتظار (${m.expectFail})`);
    }
  }
  fs.writeFileSync(FILES[m.file], src[m.file]);
}

/* بازبینیِ خطِ پایه (بدون جهش) */
execSync('node build.js', { stdio: 'pipe' });
try {
  execSync('node tests/visitors2.js', { stdio: 'pipe' });
  console.log('  ✅ خطِ پایه (بدون جهش) سبز است');
} catch (e) {
  console.log('  ❌ خطِ پایه شکست — جهش‌ها را دوباره بررسی کنید');
}
console.log(`\nvisitors-mutations: ${killed}/${MUTS.length} جهش کشته شد ${killed === MUTS.length ? '✅' : '❌'}`);
process.exit(killed === MUTS.length ? 0 : 1);
