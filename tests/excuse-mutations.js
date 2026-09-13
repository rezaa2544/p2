#!/usr/bin/env node
/* E.5 فرناز — تست جهش: node tests/excuse-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('exc-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const MUTS = [
  { id: 'M1', file: 'src/js/20-communication-finance.js', from: "ref:'att_'+rec.id", to: 'ref:null',
    expectFail: 'T10 notif created once with ref', why: 'ارجاع اعلان به رکورد حذف شد' },
  { id: 'M2', file: 'src/js/20-communication-finance.js', from: 'if(absencePendingFor(rec))', to: 'if(false)',
    expectFail: 'T4 pending: badge, no button', why: 'بج انتظار حذف شد' },
  { id: 'M3', file: 'src/js/66-client-features.js', from: "if(dup){ S.__cfRid=0; closeModal(); toast('برای این غیبت قبلاً درخواست ثبت شده", to: "if(false){ S.__cfRid=0; closeModal(); toast('برای این غیبت قبلاً درخواست ثبت شده",
    expectFail: 'T8 no duplicate request', why: 'ضدتکرار ذخیره حذف شد' },
  { id: 'M4', file: 'src/js/20-communication-finance.js', from: "if(!u||u.role!=='parent')return '';", to: "if(false)return '';",
    expectFail: 'T12 gate tested directly', why: 'گیت ولی برداشته شد' },
  { id: 'M5', file: 'src/js/66-client-features.js', from: "status:'pending',created_at:todayISO()});", to: "status:'pending',created_at:todayISO()});update('attendance',rec.id,{status:'excused'});",
    expectFail: 'T7c status NOT changed by parent', why: 'ولی مستقیم وضعیت را عوض کرد (نقض اصل)' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe', env: kit.env() }); } /* build در سایه */
function runSuite() {
  try { return execFileSync('node', ['tests/excuse.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: kit.env() }); }
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
console.log('excuse-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
