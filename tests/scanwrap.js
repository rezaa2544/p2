#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ لفافِ اسکنِ راز (tools/secret-scan.js)
   SW1: رویِ درختِ تمیز، خروجِ ۰ (هم‌ارزِ اجرایِ مستقیم)
   SW2: نفوذِ مصنوعی را با خروجِ غیرصفر پس می‌فرستد (و پاک می‌کند)
   اجرا:  node tests/scanwrap.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0;
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function run(cmd){
  try { execSync(cmd, { cwd: ROOT, stdio: 'pipe' }); return 0; }
  catch(e){ return typeof e.status === 'number' ? e.status : 99; }
}

console.log('\n🔍 Scanwrap Tests (tools/secret-scan.js delegates)');
// SW1: parity on clean tree
const direct = run('node tests/secret-scan.js');
const wrap = run('node tools/secret-scan.js');
chk('SW1: لفاف رویِ درختِ تمیز خروجِ ۰ می‌دهد (هم‌ارزِ مستقیم)', direct === 0 && wrap === 0, 'direct=' + direct + ' wrap=' + wrap);

// SW2: failure propagates (fixture content built programmatically so this file stays clean)
const fix = path.join(ROOT, 'scanwrap-fixture-' + process.pid + '.env');
let saw = -1, cleaned = false;
try {
  fs.writeFileSync(fix, '# fixture\nFAKE=' + 'ghp_' + 'x'.repeat(20) + '\n');
  saw = run('node tools/secret-scan.js');
} finally {
  try { fs.unlinkSync(fix); } catch(e){}
  cleaned = !fs.existsSync(fix);
}
chk('SW2: نفوذِ مصنوعی خروجِ غیرصفر می‌دهد و فیکسچر پاک می‌شود', saw !== 0 && cleaned, 'exit=' + saw + ' cleaned=' + cleaned);

const N = 2;
console.log(pass === N ? `\nScanwrap Tests: ${N}/${N} passed\n` : `\nScanwrap Tests: ${pass}/${N} FAILED\n`);
process.exit(pass === N ? 0 : 1);
