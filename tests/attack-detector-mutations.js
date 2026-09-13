#!/usr/bin/env node
/* Mutation tests for Q3 detector/abuse-guard signatures and alert egress. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانیِ درجا و finally حذف شدند (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('adet-mut-');
const sources = {
  detector: path.join(ROOT, 'server', 'attack-detector.js'),
  guard: path.join(ROOT, 'server', 'abuse-guard.js')
};
const original = Object.fromEntries(Object.entries(sources).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
const mutants = [
  { file: 'detector', name: 'AD-M1 sequential enumeration threshold is disabled', from: 'item.sequential >= thresholds.enumeration', to: 'false /* MUT: enumeration disabled */' },
  { file: 'detector', name: 'AD-M2 cross-user login signature is disabled', from: 'item.subjects.size >= thresholds.loginDistinct', to: 'false /* MUT: login signature disabled */' },
  { file: 'detector', name: 'AD-M3 cross-school signature is disabled', from: 'item.count >= thresholds.crossSchool', to: 'false /* MUT: cross-school disabled */' },
  { file: 'detector', name: 'AD-M4 forged-sync signature is ignored', from: "if (!['forged_by', 'user_mismatch', 'school_mismatch', 'ownership_forge'].includes(code)) return [];", to: 'if (true /* MUT: ignore forged sync */) return [];' },
  { file: 'guard', name: 'AD-M5 audit alert egress is renamed', from: "audit('attack_pattern_detected', compact)", to: "audit('MUT_missing_attack_audit', compact)" },
  { file: 'guard', name: 'AD-M6 webhook alert egress is suppressed', from: "await webhook({ type: 'attack_pattern', ...compact })", to: 'await Promise.resolve(false) /* MUT: no webhook */' }
];
function execute(e) {
  try { return { code: 0, output: execFileSync(process.execPath, ['tests/attack-detector.js'], { cwd: ROOT, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], env: e }) }; }
  catch (err) { return { code: typeof err.status === 'number' ? err.status : 1, output: String(err.stdout || '') + String(err.stderr || '') }; }
}
let killed = 0;
let prevAbs = null;
console.log('\n▸ Attack-detector mutation tests (AD-M1–AD-M6)');
try {
  for (const mutant of mutants) {
    const file = sources[mutant.file];
    if (!original[mutant.file].includes(mutant.from)) throw new Error('Mutation anchor missing: ' + mutant.name);
    const mcopy = kit.mutant(file, original[mutant.file].replace(mutant.from, mutant.to)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(file).mode); } catch (_) {}
    if (prevAbs && prevAbs !== file) kit.clear(prevAbs); /* فایل‌های متناوب: فقط جهشِ جاری فعال */
    prevAbs = file;
    const result = execute(kit.env());
    const detected = result.code !== 0 && /AD-\d+.*❌|FAILED/.test(result.output);
    if (detected) { killed += 1; console.log('  ✅ ' + mutant.name + ' — killed'); }
    else { console.log('  ❌ ' + mutant.name + ' — survived'); console.log('     ' + result.output.split('\n').slice(-8).join('\n     ')); }
  }
} finally { if (prevAbs) kit.clear(prevAbs); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */ }
const restored = execute();
const restoredGreen = restored.code === 0 && /attack-detector: 10\/10 checks ✅/.test(restored.output);
console.log('\nattack-detector mutations: ' + killed + '/' + mutants.length + ' killed' + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);
