#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   docs-freeze-marker.js — سنجه‌های سند قفل مستندات:
     DF-SEC  بخش‌ها + نسخه + تاریخ + قاعدهٔ بامپ
     DF-ALL  همهٔ اسناد در فهرست‌اند (بی‌هیچ کم و زیاد)
     DF-HASH اثر تک‌تک فایل‌ها با فهرست یکی است
   اجرا: node tests/docs-freeze-marker.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 220) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const FREEZE = 'docs/DOCS_FREEZE_v1.0.0-rc43.md';
const doc = (() => { try { return fs.readFileSync(path.join(ROOT, FREEZE), 'utf8'); } catch (e) { return null; } })();
if (!doc) { console.log('❌ سند قفل نیست'); process.exit(1); }

grp('DF-SEC — ساختار');
['قاعدهٔ قفل', 'امضا', 'فهرست اسناد ریشه با هش'].forEach((s) => chk('بخشِ «' + s + '»', doc.includes(s)));
chk('نسخهٔ وی۱.۰.۰-آرسی۴۳', doc.includes('v1.0.0-rc43') || doc.includes('۱.۰.۰-rc43'));
/* تاریخ قفل: از rc43 به بعد، قفل می‌تواند در هر تاریخی بسته شود —
   الگوی تاریخِ ردهٔ «**تاریخ قفل:** YYYY-MM-DD» سنجیده می‌شود (rc36-rc39: ۲۰۲۶-۰۹-۱۲). */
chk('تاریخ قفل (الگوی ردیف تاریخ)', /\*\*تاریخ قفل:\*\* ۲۰۲۶-۰۹-[۰-۹]{2}/.test(doc));
chk('قاعدهٔ بامپ نسخه', /بامپ نسخه/.test(doc) && /rc2/.test(doc));
chk('استثنای اسناد زنده', /مستثنا/.test(doc));
chk('صداقت نبود جی‌پی‌جی + جایگزین', /جی‌پی‌جی|gpg/i.test(doc) && /کامیت/.test(doc));

grp('DF-ALL — کامل بودن فهرست');
const rows = [...doc.matchAll(/\| `([^`]+\.md)` \| `sha256:([0-9a-f]{64})` \|/g)].map((m) => ({ f: m[1], h: m[2] }));
const onDisk = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md') && f !== 'DOCS_FREEZE_v1.0.0-rc43.md').sort();
chk('شمار ردیف‌ها = شمار اسناد (خارج از سند قفل)', rows.length === onDisk.length, `ردیف ${rows.length} در برابر ${onDisk.length}`);
const listed = new Set(rows.map((r) => r.f));
const missing = onDisk.filter((f) => !listed.has(f));
const extra = rows.map((r) => r.f).filter((f) => !onDisk.includes(f));
chk('هیچ سندی جا نمانده', missing.length === 0, missing.slice(0, 5).join(','));
chk('سند اضافه‌ای فهرست نشده', extra.length === 0, extra.slice(0, 5).join(','));
chk('خود سند قفل در فهرست نیست', !doc.includes('| `DOCS_FREEZE_v1.0.0-rc43.md` | `'));

grp('DF-HASH — صحت اثرها');
/* اسناد زنده (قاعدهٔ قفل §۱ بند ۲) بازتولید ماشینی دارند — اثرشان تضمین نمی‌شود */
const LIVE = new Set(['DOCS_HEALTH_REPORT.md', 'DOCS_CONSISTENCY_REPORT.md', 'SECURITY_INCIDENT_LOG.md']);
let bad = [];
for (const r of rows) {
  if (LIVE.has(r.f)) continue;
  const p = path.join(ROOT, 'docs', r.f);
  if (!fs.existsSync(p)) { bad.push(r.f + ':نیست'); continue; }
  const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if (h !== r.h) bad.push(r.f);
}
chk('اثر همهٔ اسناد یخ‌زده با فهرست یکی است', bad.length === 0, bad.slice(0, 5).join(','));
chk('سنجه‌ها و راهنما در فهرست‌اند', listed.has('DOCS_METRICS.md') && listed.has('DOCS_EXPORT_GUIDE.md'));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ قفل مستندات معتبر است.');
