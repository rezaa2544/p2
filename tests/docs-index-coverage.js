#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   docs-index-coverage.js — سنجه‌های نمایهٔ مرکزی مستندات:
     DI-SEC   شش بخش الزامی
     DI-START شروع سریع: پنج سند به ترتیب
     DI-TOC   دسته‌های نه‌گانه + اسناد اصلی هر دسته
     DI-DEP   نمودار وابستگی
     DI-OWN   نقشهٔ مالکیت شش مالک
     DI-HLT   وضعیت سلامت + ارجاع به گزارش سلامت
     DI-PLAN  اسناد آیندهٔ پنج‌گانه
     DI-EXIST وجود همهٔ اسناد اصلی روی دیسک
   اجرا: node tests/docs-index-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

const doc = rd('docs/DOCS_INDEX.md');
if (!doc) { console.log('❌ docs/DOCS_INDEX.md نیست'); process.exit(1); }

grp('DI-SEC — بخش‌های شش‌گانه');
[
  ['شروع سریع', /شروع سریع/],
  ['فهرست بر اساس دسته', /فهرست بر اساس دسته/],
  ['نمودار وابستگی', /نمودار وابستگی/],
  ['نقشهٔ مالکیت', /نقشهٔ مالکیت/],
  ['وضعیت سلامت', /وضعیت سلامت/],
  ['اسناد آینده', /اسناد آینده/]
].forEach(([label, re]) => chk('بخشِ «' + label + '»', re.test(doc)));

grp('DI-START — شروع سریع');
const start = doc.split(/شروع سریع/)[1].split(/فهرست بر اساس دسته/)[0];
['SUPERVISOR_BRIEF.md', 'ROADMAP.md', 'NATIONAL_ARCHITECTURE.md', 'PRODUCTION_READINESS_CHECKLIST.md', 'GO_LIVE_PACKAGE.md']
  .forEach((s, i) => chk('سند ' + (i + 1) + ' شروع سریع: ' + s, start.includes(s)));
const order = ['SUPERVISOR_BRIEF.md', 'ROADMAP.md', 'NATIONAL_ARCHITECTURE.md', 'PRODUCTION_READINESS_CHECKLIST.md', 'GO_LIVE_PACKAGE.md']
  .map((s) => start.indexOf(s));
chk('ترتیب پنج سند حفظ شده', order.every((v, i) => i === 0 || v > order[i - 1]), order.join(','));

grp('DI-TOC — دسته‌بندی');
['استراتژی و برنامه‌ریزی', 'معماری', 'امنیت', 'پایایی', 'بهره‌برداری و انتشار', 'انتشار و نتایج', 'خط پایه', 'گزارش موج‌ها', 'هماهنگی و تحویل', 'مستندات توسعه‌دهندگان', 'بایگانی و تاریخچه']
  .forEach((c) => chk('دستهٔ «' + c + '»', doc.includes(c)));
['CAPACITY_MODEL.md', 'LOAD_TEST_PLAN.md', 'PILOT_ROLLOUT_PLAN.md', 'DATABASE_ARCHITECTURE.md', 'AUTHORIZATION_MODEL.md', 'SYNC_PROTOCOL.md', 'OBSERVABILITY.md', 'SECURITY_MODEL.md', 'PEN_TEST_CHECKLIST.md', 'DISASTER_RECOVERY.md', 'DR_RUNBOOK.md', 'HA_POSTGRES.md', 'HA_REDIS.md', 'PRODUCTION_RUNBOOK.md', 'INCIDENT_RESPONSE.md', 'DEPLOYMENT_GUIDE.md', 'MIGRATION_GUIDE.md', 'P0_BLOCKER_TRACKER.md', 'RELEASE_NOTES.md', 'LOAD_TEST_RESULTS.md', 'NATIONAL_BASELINE.md', 'SUPERVISOR_BRIEF.md']
  .forEach((s) => chk('سند اصلی «' + s + '» در نمایه', doc.includes(s)));
chk('راهنمای وضعیت سه‌حالته', /✅ کامل/.test(doc) && /🟡 زنده/.test(doc) && /⚪ منجمد/.test(doc));

grp('DI-DEP — وابستگی‌ها');
chk('چتر ملی به زیرسندهایش وابسته است', /NATIONAL_ARCHITECTURE/.test(doc) && /DATABASE_ARCHITECTURE/.test(doc) && /AUTHORIZATION_MODEL/.test(doc));
chk('ردیاب به بستهٔ انتشار و چک‌لیست وابسته است', /P0_BLOCKER_TRACKER/.test(doc) && /GO_LIVE_PACKAGE/.test(doc) && /PRODUCTION_READINESS_CHECKLIST/.test(doc));
chk('پایلوت به پیش‌شرط گو وصل است', /پیش‌شرط گو/.test(doc));

grp('DI-OWN — مالکیت');
['چت ۱', 'چت ۲', 'چت ۳', 'چت ۴', 'چت ۵', 'چت ۶', 'ناظر'].forEach((o) => chk('مالکِ «' + o + '» در جدول', doc.includes('| ' + o + ' |')));

grp('DI-HLT — سلامت');
const hlt = doc.split(/وضعیت سلامت/)[1].split(/اسناد آینده/)[0];
chk('سه دسته: به‌روز / مشروط / منسوخ', /به‌روز/.test(hlt) && /مشروط/.test(hlt) && /منسوخ/.test(hlt));
chk('یتیم‌ها شناسایی شده‌اند', /یتیم/.test(hlt) && /SUPERVISOR_BRIEF\.md/.test(hlt) && /ARENA4_PERFORMANCE_INFRA\.md/.test(hlt));
chk('ارجاع به گزارش سلامت ماشین‌ساز', /DOCS_HEALTH_REPORT/.test(hlt) && /docs-health\.sh/.test(doc));

grp('DI-PLAN — اسناد آینده');
const plan = doc.split(/اسناد آینده/)[1];
chk('فهرست آینده خالی شده است', /فهرست خالی است/.test(plan));
['ONBOARDING_NEW_DEVELOPER.md', 'TROUBLESHOOTING.md', 'FAQ.md', 'API_CHANGELOG.md', 'SECURITY_INCIDENT_LOG.md', 'WAVE13_ASVS_AUDIT.md', 'OBSERVABILITY_LIVE_SETUP.md']
  .forEach((s) => chk('سند تحویل‌شدهٔ «' + s + '» دیگر در آینده نیست', !plan.split(/تحویل‌شده/)[0].includes(s)));
chk('قاعدهٔ ضدیتیم برای سند جدید', /یتیم ممنوع|دست‌کم یک سند دیگر به آن ارجاع/.test(doc));

grp('DI-EXIST — وجود اسناد اصلی روی دیسک');
const MAIN_DOCS = ['SUPERVISOR_BRIEF', 'ROADMAP', 'NATIONAL_ARCHITECTURE', 'PRODUCTION_READINESS_CHECKLIST', 'GO_LIVE_PACKAGE', 'P0_BLOCKER_TRACKER', 'PILOT_ROLLOUT_PLAN', 'RELEASE_NOTES', 'LOAD_TEST_PLAN', 'LOAD_TEST_RESULTS', 'CAPACITY_MODEL', 'NATIONAL_ROADMAP_PROGRESS', 'NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM', 'DATABASE_ARCHITECTURE', 'AUTHORIZATION_MODEL', 'SYNC_PROTOCOL', 'OBSERVABILITY', 'OBSERVABILITY_DEPLOYMENT', 'SECURITY_MODEL', 'THREAT_MODEL', 'PEN_TEST_CHECKLIST', 'DISASTER_RECOVERY', 'DR_RUNBOOK', 'RELIABILITY_DR_PLAN', 'HA_POSTGRES', 'HA_REDIS', 'PRODUCTION_RUNBOOK', 'INCIDENT_RESPONSE', 'DEPLOYMENT_GUIDE', 'MIGRATION_GUIDE', 'PR_MERGE_PLAN', 'RELEASE_GATE_CHECKLIST', 'RELEASE_GATE_EVIDENCE', 'NATIONAL_BASELINE', 'NATIONAL_BASELINE_PART2', 'NATIONAL_BASELINE_PART3', 'NATIONAL_BASELINE_PART4', 'SCALE_10M', 'BOTTLENECK_MAP', 'CACHE_STRATEGY_DESIGN', 'ARENA5_QA_RELIABILITY', 'ARENA4_PERFORMANCE_INFRA', 'PRIVACY_POLICY', 'HANDOFF_ARCHIVE'];
const missing = MAIN_DOCS.filter((n) => !fs.existsSync(path.join(ROOT, 'docs', n + '.md')));
chk('همهٔ ' + MAIN_DOCS.length + ' سند اصلی وجود دارند', missing.length === 0, missing.join(','));
chk('هندآف در ریشه هست', fs.existsSync(path.join(ROOT, 'HANDOFF.md')));
chk('سیزده سند تحویل‌شده ساخته شده‌اند', ['ONBOARDING_NEW_DEVELOPER.md', 'TROUBLESHOOTING.md', 'FAQ.md', 'API_CHANGELOG.md', 'SECURITY_INCIDENT_LOG.md', 'DOCS_CONSISTENCY_REPORT.md', 'DATA_DICTIONARY.md', 'WAVE13_ASVS_AUDIT.md', 'OBSERVABILITY_LIVE_SETUP.md', 'DOCUMENTATION_HANDOVER.md', 'DOCS_EXPORT_GUIDE.md', 'DOCS_METRICS.md', 'DOCS_FREEZE_v1.0.0-rc1.md'].every((s) => fs.existsSync(path.join(ROOT, 'docs', s))));
chk('چهار سند ویژگی بستهٔ هفت‌گانه از ادغام رسیده‌اند', ['INTERNSHIP_MODULE.md', 'BEHAVIOR_GAMIFICATION.md', 'HEALTH_INDEX_MODULE.md', 'BUG_HUNT_REPORT.md'].every((s) => fs.existsSync(path.join(ROOT, 'docs', s))));
chk('بستهٔ انطباق قانونی ایران در نمایه و دیسک هست', fs.existsSync(path.join(ROOT, 'docs', 'IRAN_COMPLIANCE_PACKAGE.md')) && doc.includes('IRAN_COMPLIANCE_PACKAGE.md'));
chk('نمایه در شروع سریع به بستهٔ تحویل ارجاع دارد', doc.includes('DOCUMENTATION_HANDOVER.md'));
chk('نمایه به گزارش هماهنگی و دیکشنری داده ارجاع دارد', doc.includes('DOCS_CONSISTENCY_REPORT.md') && doc.includes('DATA_DICTIONARY.md'));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ نمایهٔ مرکزی کامل و سازگار است.');
