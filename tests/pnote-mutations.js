#!/usr/bin/env node
/* E.6 فرناز — تست جهش: node tests/pnote-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('pn-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const MUTS = [
  { id: 'M1', file: 'src/js/17-student-record.js', from: "return 'payesh_note_'+pid+'_'+sid;", to: "return 'payesh_note_'+sid;",
    expectFail: 'T4a other parent: card but empty', why: 'کلید بدون ولی شد (نشت بین والدین)' },
  { id: 'M2', file: 'src/js/17-student-record.js', from: "if(!u||u.role!=='parent'||!noteLinkedParent(u.id,sid))return '';", to: "if(false)return '';",
    expectFail: 'T5 student sees nothing', why: 'گیت نمایش برداشته شد' },
  { id: 'M3', file: 'src/js/19-actions-core.js', from: "||typeof noteLinkedParent!=='function'||!noteLinkedParent(u.id,sid)", to: '',
    expectFail: 'T12a unlinked save rejected', why: 'گارد لینک در اکشن حذف شد' },
  { id: 'M4', file: 'src/js/19-actions-core.js', from: 'if(t.length>500){toast', to: 'if(false){toast',
    expectFail: 'T8 over-500 rejected', why: 'سقف ۵۰۰ حذف شد' },
  { id: 'M5', file: 'src/js/17-student-record.js', from: "esc(n?n.text:'')", to: "(n?n.text:'')",
    expectFail: 'T11 xss escaped', why: 'گریز HTML حذف شد' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe', env: kit.env() }); } /* build در سایه */
function runSuite() {
  try { return execFileSync('node', ['tests/pnote.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: kit.env() }); }
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
console.log('pnote-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
