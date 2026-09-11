#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   data-dictionary-coverage.js — سنجه‌های دیکشنری داده:
     DD-SEC  سه بخش اصلی + شمار جدول‌ها
     DD-ALL  هر جدول: ستون‌ها/قیدها/ایندکس‌ها/نمونه
     DD-KEY  جدول‌های کلیدی + اعداد نمای کلی
     DD-GEN  تولید مجدد قطعی و هم‌خوان (بایت-به-بایت)
   اجرا: node tests/data-dictionary-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const P = 'docs/DATA_DICTIONARY.md';
const doc = fs.readFileSync(path.join(ROOT, P), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

grp('DD-SEC — ساختار');
['نمای کلی', 'جدول‌ها (به ترتیب الفبا)', 'یادداشت‌های اجرایی برای دی‌بی‌ای', 'نمودار روابط اصلی'].forEach((s) => chk('بخشِ «' + s + '»', doc.includes(s)));
const sections = doc.match(/^### `[a-z_]+`$/gm) || [];
chk('شمار بخش جدول‌ها: ۹۳', sections.length === 93, String(sections.length));
const samples = doc.match(/```json/g) || [];
chk('هر جدول رکورد نمونه دارد (۹۳ بلوک جی‌سان)', samples.length === 93, String(samples.length));
const names = sections.map((s) => s.slice(5, -1));
chk('ترتیب الفبایی بخش‌ها', JSON.stringify(names) === JSON.stringify([...names].sort()));

grp('DD-KEY — جدول‌ها و اعداد کلیدی');
['schools', 'users', 'classes', 'subjects', 'enrollments', 'grades', 'attendance', 'schedule', 'parent_links',
 'sync_conflicts', 'server_outbox', 'server_tombstones', 'server_auth_codes', 'server_processed_uids', 'server_revoked_jti']
  .forEach((t) => chk('جدول «' + t + '»', doc.includes('### `' + t + '`')));
chk('شمار جدول‌ها در نمای کلی: ۹۳', /تعداد جدول‌ها \| \*\*93\*\*/.test(doc));
chk('ستون نسخهٔ او‌سی‌سی معرفی شده', /ستون نسخه \(OCC\)/.test(doc) && doc.includes('`grades`'));
chk('پستگرس ۱۶ اعلام شده', /PostgreSQL 16/.test(doc));
chk('منابع حقیقت ذکر شده‌اند', /migrations\/001/.test(doc) && /authz\/model\.json/.test(doc) && /server\/schema\.sql/.test(doc));

grp('DD-ALL — اجزای هر جدول');
const parts = doc.split(/^### `/m).slice(1);
let missing = [];
for (const p of parts) {
  const name = p.slice(0, p.indexOf('`'));
  if (!/\*\*ستون‌ها:\*\*/.test(p)) missing.push(name + ':ستون');
  if (!/\*\*قیدها:\*\*/.test(p)) missing.push(name + ':قید');
  if (!/\*\*ایندکس‌ها:\*\*/.test(p)) missing.push(name + ':ایندکس');
  if (!/\*\*رکورد نمونه:\*\*/.test(p)) missing.push(name + ':نمونه');
  if (!/\*\*PK:\*\*/.test(p)) missing.push(name + ':PK');
}
chk('همهٔ جدول‌ها چهار زیربخش دارند', missing.length === 0, missing.slice(0, 5).join(','));
chk('مدارس ریشهٔ مستأجر معرفی شده', /ریشهٔ مستأجر/.test(doc));

grp('DD-GEN — تولید قطعی');
const before = md5(doc);
execFileSync('node', ['tools/generate-data-dictionary.js'], { cwd: ROOT, stdio: 'pipe' });
const after = md5(fs.readFileSync(path.join(ROOT, P), 'utf8'));
chk('تولید مجدد بایت-به-بایت یکسان است', before === after);
chk('ابزار مولد در ریپو است', fs.existsSync(path.join(ROOT, 'tools/generate-data-dictionary.js')));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ دیکشنری داده کامل است.');
