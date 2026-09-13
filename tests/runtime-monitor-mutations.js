#!/usr/bin/env node
/* Mutation tests for the Q3 runtime monitor. Each mutant must make an
   externally observable runtime-monitor regression fail. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانیِ درجا و finally حذف شدند (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('rmon-mut-');
const FILE = path.join(ROOT, 'server', 'runtime-monitor.js');
const original = fs.readFileSync(FILE, 'utf8');
const mutants = [
  { name: 'RM-M1 anomaly threshold is disabled', from: 'if (item.value > threshold) {', to: 'if (false /* MUT: threshold disabled */) {' },
  { name: 'RM-M2 per-bucket alert deduplication is disabled', from: 'item.alertedSlot !== item.slot', to: 'true /* MUT: duplicate alerts */' },
  { name: 'RM-M3 tenant switch detection is disabled', from: 'const switched = item.tenant && tenant && item.tenant !== tenant;', to: 'const switched = false; /* MUT */' },
  { name: 'RM-M4 session-cap eviction is disabled', from: 'while (sessions.size > maxSessions)', to: 'while (false /* MUT: unbounded sessions */)' }
];
function execute(e) {
  try { return { code: 0, output: execFileSync(process.execPath, ['tests/runtime-monitor.js'], { cwd: ROOT, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], env: e }) }; }
  catch (err) { return { code: typeof err.status === 'number' ? err.status : 1, output: String(err.stdout || '') + String(err.stderr || '') }; }
}
let killed = 0;
console.log('\n▸ Runtime-monitor mutation tests (RM-M1–RM-M4)');
try {
  for (const mutant of mutants) {
    if (!original.includes(mutant.from)) throw new Error('Mutation anchor missing: ' + mutant.name);
    const mcopy = kit.mutant(FILE, original.replace(mutant.from, mutant.to)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(FILE).mode); } catch (_) {}
    const result = execute(kit.env());
    const detected = result.code !== 0 && /RM-\d+.*❌|FAILED/.test(result.output);
    if (detected) { killed += 1; console.log('  ✅ ' + mutant.name + ' — killed'); }
    else { console.log('  ❌ ' + mutant.name + ' — survived'); console.log('     ' + result.output.split('\n').slice(-8).join('\n     ')); }
  }
} finally { kit.clear(FILE); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */ }
const restored = execute();
const restoredGreen = restored.code === 0 && /runtime-monitor: 9\/9 checks ✅/.test(restored.output);
console.log('\nruntime-monitor mutations: ' + killed + '/' + mutants.length + ' killed' + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);
