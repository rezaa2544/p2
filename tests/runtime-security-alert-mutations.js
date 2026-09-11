#!/usr/bin/env node
/* Mutation tests for Q3 alert rules and the RC-016 operational contract. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = {
  rules: path.join(ROOT, 'infra', 'observability', 'alert-rules.yml'),
  runbook: path.join(ROOT, 'docs', 'RUNBOOK_CARDS', 'RC-016.md')
};
const original = Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
const mutants = [
  { file: 'rules', suite: 'tests/observability-config.js', name: 'AR-M1 AnomalyDetected rule is renamed', from: 'alert: AnomalyDetected', to: 'alert: MUT_missing_AnomalyDetected', expect: 'قانون AnomalyDetected با آستانهٔ درست' },
  { file: 'rules', suite: 'tests/observability-config.js', name: 'AR-M2 attack signature metric is disconnected', from: 'payesh_attack_patterns_detected_total', to: 'payesh_mut_missing_attack_total', expect: 'قانون AttackPatternSignature با آستانهٔ درست' },
  { file: 'rules', suite: 'tests/observability-config.js', name: 'AR-M3 suspicious-session threshold is disabled', from: 'payesh_suspicious_sessions > 0', to: 'payesh_suspicious_sessions > 999999', expect: 'قانون SuspiciousSession با آستانهٔ درست' },
  { file: 'runbook', suite: 'tests/runbook-cards-coverage.js', name: 'AR-M4 RC-016 loses anomaly alert response', from: 'AnomalyDetected', to: 'MUT_NO_ANOMALY', all: true, expect: 'RC-016 سه آلارم runtime و پیوند مهار را دارد' }
];
function execute(suite) {
  try { return { code: 0, output: execFileSync(process.execPath, [suite], { cwd: ROOT, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (err) { return { code: typeof err.status === 'number' ? err.status : 1, output: String(err.stdout || '') + String(err.stderr || '') }; }
}
let killed = 0;
console.log('\n▸ Runtime-security alert mutation tests (AR-M1–AR-M4)');
try {
  for (const mutant of mutants) {
    const file = FILES[mutant.file];
    if (!original[mutant.file].includes(mutant.from)) throw new Error('Mutation anchor missing: ' + mutant.name);
    const source = original[mutant.file];
    fs.writeFileSync(file, mutant.all ? source.split(mutant.from).join(mutant.to) : source.replace(mutant.from, mutant.to));
    const result = execute(mutant.suite);
    fs.writeFileSync(file, source);
    const detected = result.code !== 0 && result.output.includes('❌ ' + mutant.expect);
    if (detected) { killed += 1; console.log('  ✅ ' + mutant.name + ' — killed'); }
    else { console.log('  ❌ ' + mutant.name + ' — survived'); console.log('     ' + result.output.split('\n').slice(-8).join('\n     ')); }
  }
} finally { for (const [name, file] of Object.entries(FILES)) fs.writeFileSync(file, original[name]); }
const cfg = execute('tests/observability-config.js');
const cards = execute('tests/runbook-cards-coverage.js');
const restoredGreen = cfg.code === 0 && cards.code === 0;
console.log('\nruntime-security alert mutations: ' + killed + '/' + mutants.length + ' killed' + (restoredGreen ? ' — restored green ✅' : ' — restore check FAILED'));
if (killed !== mutants.length || !restoredGreen) process.exit(1);
