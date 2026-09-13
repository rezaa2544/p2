#!/usr/bin/env node
/* E.2 فرناز — تست جهش: node tests/examcount-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('ec-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const MUTS = [
  { id: 'M1', file: 'src/js/08-dashboard.js', from: 'if(!best||x.date<best.date', to: 'if(!best||x.date>best.date',
    expectFail: 'T2 nearest wins', why: 'نزدیک‌ترین→دورترین' },
  { id: 'M2', file: 'src/js/08-dashboard.js', from: 'if(nx.days<=2)examReminderSend(sid,nx);', to: 'if(nx.days<=-1)examReminderSend(sid,nx);',
    expectFail: 'T6a sms queued once', why: 'پنجرهٔ یادآوری بسته شد' },
  { id: 'M3', file: 'src/js/08-dashboard.js', from: "if(!dup&&typeof notifyRequest==='function'){", to: "if(true&&typeof notifyRequest==='function'){",
    expectFail: 'T7a sms still once', why: 'ضدتکرار پیامک حذف شد' },
  { id: 'M4', file: 'src/js/08-dashboard.js', from: 'if(!Store.get(examRemindKey(ex.id))){', to: 'if(true){',
    expectFail: 'T7b in-app still once each', why: 'ضدتکرار اعلان حذف شد' },
  { id: 'M5', file: 'src/js/08-dashboard.js', from: 'if(x.class_id!==cls.id||!x.date||x.date<iso)return;', to: 'if(x.class_id!==cls.id||!x.date)return;',
    expectFail: 'T5 past exam ignored', why: 'فیلتر گذشته حذف شد' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe', env: kit.env() }); } /* build در سایه */
function runSuite() {
  try { return execFileSync('node', ['tests/examcount.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: kit.env() }); }
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
console.log('examcount-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
