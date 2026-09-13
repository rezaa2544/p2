#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   national-dataset-mutations.js — جهش‌سنجیِ گیتِ دیتاستِ ملی (P0-4)
   هر جهش: نقصی عمدی در مولد تزریق ⇒ tests/national-dataset-integrity.js
   باید قرمز شود ⇒ restore. اگر جهشی زنده بماند، گیتِ integrity ضعیف است.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'tools', 'generate-national-dataset.js');

/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ هم‌جوارِ جدا (mutant-kit)؛
   سورس اصلی هرگز بازنویسی نمی‌شود — restore/بازگردانیِ درجا حذف شد. */
const { session } = require('./helpers/mutant-kit');
const kit = session('nat-');
const orig = fs.readFileSync(GEN, 'utf8');
/* بازگردانی درجا حذف شد: جهش در کپیِ kit می‌نشیند و خودکار پاک می‌شود */

const mutations = [
  {
    name: 'تولیدِ enrollments حذف شود (فایل نیست ⇒ N1/N2 قرمز)',
    mutate: (s) => s.replace(/\/\* 7\) enrollments[\s\S]*?log\('  enrollments ' \+ done\.enrollments\.rows\);\n\}\n/, '')
  },
  {
    name: 'نسبتِ اقساط خراب شود (۲ به‌جای ۳ ولی stats همان ۳ را ادعا کند ⇒ N2/N7/N9 قرمز)',
    mutate: (s) => s.replace('for(let q = 0; q < P.INST_PER_TUITION; q++){', 'for(let q = 0; q < P.INST_PER_TUITION - 1; q++){')
  },
  {
    name: 'enrollment به مدرسهٔ غلط اشاره کند (tenant break ⇒ N5 قرمز)',
    mutate: (s) => s.replace("w.push([k + 1, schoolOfClass(cls), studentOf(k), cls, 1405, TS(0, 8, k % 60)]);",
      "w.push([k + 1, (schoolOfClass(cls) % P.schools) + 1, studentOf(k), cls, 1405, TS(0, 8, k % 60)]);")
  },
  {
    name: 'RNG از seed جدا شود (determinism بین seedها ⇒ N4 قرمز)',
    mutate: (s) => s.replace('const rng = mulberry32(SEED);', 'const rng = mulberry32(12345);')
      .replace('const NID_K = (SEED % 900000000) + 100000000;', 'const NID_K = 123456789;')
      .replace('const PHONE_K = (SEED % 10000000000) + 1000000000;', 'const PHONE_K = 1234567890;')
  },
  {
    name: 'hotspot خنثی شود (بدون پیامِ اضافه ⇒ N2/N10 قرمز)',
    mutate: (s) => s.replace('for(let e = 0; e < P.hotExtraPerSchool; e++){', 'for(let e = 0; e < 0; e++){')
  },
  {
    name: 'رقمِ کنترلِ شناسهٔ ملی خراب شود (⇒ N11 قرمز)',
    mutate: (s) => s.replace("return b + (rem < 2 ? rem : 11 - rem);", "return b + '7';")
  },
  {
    name: 'checksum ِ stats دروغ بگوید (⇒ N12 قرمز)',
    mutate: (s) => s.replace("stats.checksums[f] = h.digest('hex');", "stats.checksums[f] = 'deadbeef';")
  }
];

let killed = 0, survived = 0;
const survivors = [];
console.log('\nnational-dataset-mutations — هر جهش باید گیتِ integrity را قرمز کند\n');
for (const m of mutations) {
  const mutated = m.mutate(orig);
  if (mutated === orig) {
    survived++; survivors.push(m.name + ' (الگو پیدا نشد!)');
    console.log('  ❌ جهش اعمال نشد: ' + m.name);
    continue;
  }
  const mcopy = kit.mutant(GEN, mutated); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
  try { fs.chmodSync(mcopy, fs.statSync(GEN).mode); } catch (_) {}
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'national-dataset-integrity.js')],
    /* env: کیت — نوهٔ «node <GEN>» هم از طریقِ بازمپِ ماژولِ اصلی، کپیِ جهش‌یافته را اجرا می‌کند */
    { stdio: 'pipe', timeout: 300000, env: kit.env() });
  kit.clear(GEN);
  if (r.status !== 0) { killed++; console.log('  ✅ کشته شد: ' + m.name); }
  else { survived++; survivors.push(m.name); console.log('  ❌ زنده ماند: ' + m.name); }
}

console.log('\n  جمع: ' + killed + ' کشته، ' + survived + ' زنده از ' + mutations.length);
if (survivors.length) { console.log('  زنده‌ها:'); survivors.forEach((s) => console.log('   - ' + s)); }
console.log('');
process.exit(survived ? 1 : 0);
