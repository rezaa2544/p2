#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — پارتیشن‌بندیِ وزن‌دار (فاز ۲.۴)
   ───────────────────────────────────────────────────────────────────
   هر جهش باید tests/weighted-partitioning.js را بشکند؛ وگرنه آن سنجه‌ها
   فقط سبز نشان می‌دهند. نه جهش، هر کدام یکی از تصمیم‌های حساس را هدف
   می‌گیرند: توازن، ترتیب، شمولِ ردیف‌های بی‌مدرسه، تازگیِ نمایه،
   آستانه‌ی شلوغی، و دسترسیِ نقش‌ها.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const FILE = 'server/partitioning.js';
const ORIG = fs.readFileSync(FILE, 'utf8');

const MUTS = [
  {
    name: 'M1 تقسیم به‌جای «کم‌بارترین شارد» دوره‌ای شود (توازن از بین برود)',
    bad: "      let best = 0;\n      for(let i = 1; i < shards.length; i++){\n        if(shards[i].weight < shards[best].weight) best = i;\n      }",
    mut: "      let best = all.indexOf(s) % shards.length;",
    expectFail: 'W2 تقسیمِ وزن‌دار متوازن‌تر از تقسیمِ ساده است',
  },
  {
    name: 'M2 ردیف‌هایِ بی‌مدرسه در خوانشِ مدرسه نیایند (نشت/کم‌نماییِ داده)',
    bad: "    if(!b.length) return a.map(i => rec.rows[i]);",
    mut: "    return a.map(i => rec.rows[i]);",
    expectFail: 'W6 خواندنِ تفکیک‌شده همانِ پویشِ قدیمی است',
  },
  {
    name: 'M3 ادغامِ مرتّب به چسباندن تبدیل شود (ترتیبِ خروجی عوض شود)',
    bad: "    const out = [];\n    let i = 0, j = 0;",
    mut: "    return a.map(x => rec.rows[x]).concat(b.map(x => rec.rows[x]));\n    const out = [];\n    let i = 0, j = 0;",
    expectFail: 'W6 خواندنِ تفکیک‌شده همانِ پویشِ قدیمی است',
  },
  {
    name: 'M4 بی‌اعتبارسازی بی‌اثر شود (خوانش دادهٔ کهنه بدهد)',
    bad: "  function invalidate(coll){\n    stats.invalidations++;",
    mut: "  function invalidate(coll){\n    if(true) return;\n    stats.invalidations++;",
    expectFail: 'W15 جابه‌جاییِ ردیف بینِ دو مدرسه، در هر دو دیده می‌شود',
  },
  {
    name: 'M5 نمایه هیچ‌گاه بازسازی نشود (تغییرِ طول دیده نشود)',
    bad: "    if(cur && cur.rows === rows && cur.len === rows.length) { stats.hits++; return cur; }",
    mut: "    if(cur) { stats.hits++; return cur; }",
    expectFail: 'W9 تغییرِ طولِ آرایه، نمایه را خودبه‌خود باطل می‌کند',
  },
  {
    name: 'M6 رده‌ی شلوغ همیشه normal شود (رپلیکا هرگز پیشنهاد نشود)',
    bad: "      tier: isHot ? 'hot' : 'normal',",
    mut: "      tier: 'normal',",
    expectFail: 'W5 مدرسهٔ شلوغ ⇒ رده‌ی hot و رپلیکایِ خواندن',
  },
  {
    name: 'M7 آستانه‌ی تعدادِ ردیف نادیده گرفته شود (فقط دانش‌آموز بسنجد)',
    bad: "      .filter(s => (s.students || 0) >= HOT_STUDENTS || totalRows(s) >= HOT_ROWS)",
    mut: "      .filter(s => (s.students || 0) >= HOT_STUDENTS)",
    expectFail: 'W4b با آستانه‌ی ردیف (۳۰۰۰) سه مدرسهٔ بزرگ شلوغ‌اند',
  },
  {
    name: 'M8 مدیرِ کل و اداره هم محدود به مدرسه شوند (تغییرِ رفتارِ فعلی)',
    bad: "    if(!user || user.role === 'superadmin' || user.role === 'edu_office') return rows; /* همه — رفتارِ فعلی */",
    mut: "    if(false) return rows;",
    expectFail: 'W7b مدیرِ کل و اداره همه را می‌بینند',
  },
  {
    name: 'M9 وزن فقط از دانش‌آموز بیاید (ردیف‌هایِ سنگین دیده نشوند)',
    bad: "        out[sid].weight += w;",
    mut: "        out[sid].weight += 0;",
    expectFail: 'W1c وزن شاملِ ردیف‌هایِ مجموعه‌هایِ سنگین هم هست',
  },
];

let killed = 0;
for(const m of MUTS){
  if(ORIG.indexOf(m.bad) < 0){ console.log(`  ❌ ${m.name}: الگوی جهش در ${FILE} پیدا نشد`); continue; }
  fs.writeFileSync(FILE, ORIG.replace(m.bad, m.mut));
  let out = '';
  try { execSync('node tests/weighted-partitioning.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch(e){ out = String(e.stdout || '') + String(e.stderr || ''); }
  const killedThis = /❌/.test(out) && out.includes(m.expectFail);
  fs.writeFileSync(FILE, ORIG);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (' + ((out.split('\n').find(l => l.includes('❌')) || out.slice(0,120))) + ')'}`);
  if(killedThis) killed++;
}

/* بازگشت به سبز */
let out = '', green = false;
try { out = execSync('node tests/weighted-partitioning.js', { stdio: 'pipe' }).toString(); green = /همه سبز/.test(out); }
catch(e){ out = String(e.stdout || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && green ? ' ✅ (سوئیت پس از بازگشت سبز)' : ' ⚠️'));
if(!green) console.log(out.split('\n').slice(-6).join('\n'));
process.exit(killed === MUTS.length && green ? 0 : 1);
