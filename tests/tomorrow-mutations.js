#!/usr/bin/env node
/* E.1 فرناز — تست جهش: node tests/tomorrow-mutations.js (بعد از هر جهش سورس برمی‌گردد + ری‌بیلد) */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('tm-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const MUTS = [
  { id: 'M1', file: 'src/js/08-dashboard.js', from: 'for(let i=0;i<TOMORROW_GEAR.length;i++)', to: 'for(let i=0;i<0;i++)',
    expectFail: 'T2a sport gear shown', why: 'نقشهٔ وسیله حذف شد' },
  { id: 'M2', file: 'src/js/08-dashboard.js', from: 'const tmr=addDaysISO(iso,1), dow=todayDow(tmr);', to: 'const tmr=addDaysISO(iso,0), dow=todayDow(tmr);',
    expectFail: 'T1 lessons of tomorrow listed', why: 'فردا→امروز' },
  { id: 'M3', file: 'src/js/19-actions-core.js', from: 'Store.set(k,JSON.stringify(cur));', to: '/*MUT*/void(0);',
    expectFail: 'T5d check persisted to localStorage', why: 'ذخیرهٔ تیک حذف شد' },
  { id: 'M4', file: 'src/js/08-dashboard.js', from: '(db.substitutions||[]).forEach(x=>{ if(x.date===tmr)subs[x.schedule_id]=x; });', to: '(db.substitutions||[]).forEach(x=>{ if(false)subs[x.schedule_id]=x; });',
    expectFail: 'T3 substitution badge shown', why: 'جابه‌جایی نادیده گرفته شد' },
  { id: 'M5', file: 'src/js/08-dashboard.js', from: "const on=checks['p'+s.period]?'checked':'';", to: "const on=false?'checked':'';",
    expectFail: 'T5f re-render shows checked', why: 'تیکِ ذخیره‌شده نادیده گرفته شد' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe', env: kit.env() }); } /* build در سایه */
function runSuite() {
  try { return execFileSync('node', ['tests/tomorrow.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: kit.env() }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}
let killed = 0, prevFile = null;
for (const m of MUTS) {
  const p = path.join(ROOT, m.file);
  if (prevFile && prevFile !== p) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = p;
  const orig = fs.readFileSync(p, 'utf8');
  if (!orig.includes(m.from)) { console.log('  FAIL ' + m.id + ' — anchor not found'); continue; }
  {
    kit.mutant(p, orig.replace(m.from, m.to)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
    build();
    const out = runSuite();
    const dead = out.includes('FAIL ' + m.expectFail);
    if (dead) { killed++; console.log('  PASS ' + m.id + ' killed by «' + m.expectFail + '» (' + m.why + ')'); }
    else console.log('  FAIL ' + m.id + ' SURVIVED (' + m.why + ') — expected FAIL «' + m.expectFail + '»');
  } /* بدون بازگردانی — سورس هرگز جهش نگرفت */
}
console.log('tomorrow-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
