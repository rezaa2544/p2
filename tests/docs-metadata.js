#!/usr/bin/env node
/* docs-metadata.js — تست ابزار کاتالوگ متادیتا (چت ۶، مأموریت ۳۲) */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

grp('اجرای ابزار');
let out = '';
try {
  out = execFileSync('node', ['tools/docs-metadata.js'], { cwd: ROOT, encoding: 'utf8' });
  chk('ابزار با موفقیت اجرا می‌شود', true);
} catch (e) {
  chk('ابزار با موفقیت اجرا می‌شود', false, String(e).slice(0, 120));
}
chk('خروجی متادیتا ساخته شد', fs.existsSync(path.join(ROOT, 'docs/_metadata.json')));
chk('خروجی نمایهٔ جستجو ساخته شد', fs.existsSync(path.join(ROOT, 'docs/_search-index.json')));
chk('خروجی‌ها در گیت‌ایگنور هستند', /_metadata\.json/.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')));

const tool = require(path.join(ROOT, 'tools/docs-metadata.js'));
const entries = tool.buildCatalog();
const index = tool.buildSearchIndex(entries);
const s = tool.summarize(entries);

grp('ساختار کاتالوگ');
chk('بیش از ۲۵۰ سند فهرست شده (' + fa(entries.length) + ')', entries.length > 250, String(entries.length));
const fields = ['path', 'title', 'category', 'owner', 'freeze', 'keywords', 'outgoing', 'incoming', 'status'];
chk('همهٔ ورودی‌ها فیلدهای متادیتا دارند', entries.every((e) => fields.every((f) => e[f] !== undefined)));
chk('همهٔ مسیرها واقعی‌اند', entries.every((e) => fs.existsSync(path.join(ROOT, e.path))));
chk('عنوان خالی نداریم', entries.every((e) => e.title && e.title.length > 2));
chk('اسناد زنده درست برچسب خورده‌اند', entries.filter((e) => tool.LIVE.has(path.basename(e.path))).every((e) => e.status === 'active-live'));
chk('قفل‌های تاریخی وضعیت منجمد و نسخهٔ آر‌سی دارند',
  entries.filter((e) => /DOCS_FREEZE_v1\.0\.0-rc\d+\.md$/.test(e.path)).every((e) => e.status === 'frozen' && /^rc\d+$/.test(e.freeze)));

grp('ارجاع‌ها');
const byPath = new Map(entries.map((e) => [e.path, e]));
let sym = true;
for (const e of entries) {
  for (const t of e.outgoing) {
    const te = byPath.get('docs/' + t);
    if (!te || !te.incoming.includes(e.path)) { sym = false; break; }
  }
  if (!sym) break;
}
chk('ارجاع‌های خروجی/ورودی متقارن‌اند', sym);
chk('خودارجاعی در ارجاع‌ها نیست', entries.every((e) => !e.outgoing.includes(e.path.replace(/^docs\//, ''))));

grp('یتیم‌ها و قطب‌ها');
chk('هیچ سند یتیمی وجود ندارد', s.orphans.length === 0, s.orphans.map((o) => o.path).slice(0, 3).join(','));
chk('قطب اول بیش از ۲۰ ارجاع ورودی دارد', s.hubs[0].incoming.length > 20, String(s.hubs[0].incoming.length));

grp('نمایهٔ جستجو');
const toks = Object.keys(index);
chk('بیش از هزار توکن در نمایه (' + fa(toks.length) + ')', toks.length > 1000, String(toks.length));
chk('هر توکن دست‌کم یک سند دارد', toks.every((t) => index[t].length > 0));
chk('هر نتیجهٔ جستجو سند واقعی است', toks.slice(0, 200).every((t) => index[t].every((r) => fs.existsSync(path.join(ROOT, r.path)))));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
