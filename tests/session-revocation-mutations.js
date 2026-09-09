#!/usr/bin/env node
/* tests/session-revocation-mutations.js — جهش‌ها باید کشته شوند.
   همه روی --quick (بدونِ بوت/Redis): سریع و قطعی. */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const REV = path.join(ROOT, 'server', 'revocation.js');
const AUTH = path.join(ROOT, 'server', 'auth.js');
const SUITE = path.join(__dirname, 'session-revocation.js');
const QUICK = [process.execPath, SUITE, '--quick'];

function run(argv) {
  const r = cp.spawnSync(argv[0], argv.slice(1), { cwd: ROOT, timeout: 240000,
    encoding: 'utf8', env: Object.assign({}, process.env) });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const MUTS = [
  { id: 'M1', file: REV, desc: 'isRevoked همیشه-false',
    good: '    return (await redis.get(DENY_PREFIX + jti)) != null;',
    bad: '    return false;',
    expect: 'M-b' },
  { id: 'M2', file: AUTH, desc: 'حذفِ چکِ denylist از sessionFrom',
    good: '    if(await revocation.isRevoked(p.jti)) return null;',
    bad: '    if(false) return null;',
    expect: 'M-b' },
  { id: 'M3', file: AUTH, desc: 'حذفِ چکِ نسخه (revoke-all)',
    good: '    if(sv > 0 && (p.sv || 0) < sv) return null;',
    bad: '    if(false) return null;',
    expect: 'M-c' },
];

let killed = 0, survived = 0;
for (const m of MUTS) {
  const orig = fs.readFileSync(m.file, 'utf8');
  if (orig.indexOf(m.good) < 0) {
    console.log('  ⚠️ ' + m.id + ' ' + m.desc + ' — لنگر پیدا نشد!');
    survived++;
    continue;
  }
  fs.writeFileSync(m.file, orig.replace(m.good, m.bad));
  let res;
  try {
    res = run(QUICK);
  } finally {
    fs.writeFileSync(m.file, orig);
  }
  const red = res.code !== 0 && res.out.indexOf('❌ ' + m.expect) >= 0;
  if (red) { killed++; console.log('  ✅ ' + m.id + ' ' + m.desc + ' کشته شد (' + m.expect + ' قرمز)'); }
  else {
    survived++;
    console.log('  ❌ ' + m.id + ' ' + m.desc + ' زنده ماند! exit=' + res.code);
    console.log(res.out.slice(-500));
  }
}

const fin = run(QUICK);
const green = fin.code === 0;
console.log('\nsession-revocation-mutations: ' + killed + '/3 کشته، ' + survived + ' زنده؛ سبزِ نهایی: ' + (green ? '✅' : '❌'));
process.exit(survived || !green ? 1 : 0);
