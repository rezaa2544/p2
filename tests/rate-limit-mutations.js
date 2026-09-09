#!/usr/bin/env node
/* tests/rate-limit-mutations.js — جهش‌ها باید کشته شوند (تست‌ها باید قرمز شوند).
   M1/M2/M4 روی --unit-only (بدونِ Redis)؛ M3 با بوتِ FB (fallback). بدونِ وابستگی به redis-server. */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const RL = path.join(ROOT, 'server', 'rate-limit.js');
const AUTH = path.join(ROOT, 'server', 'auth.js');
const SUITE = path.join(__dirname, 'rate-limit-distributed.js');

const UNIT = [process.execPath, SUITE, '--unit-only'];
const FULL = [process.execPath, SUITE];

function run(argv, timeoutMs) {
  const r = cp.spawnSync(argv[0], argv.slice(1), { cwd: ROOT, timeout: timeoutMs || 240000,
    encoding: 'utf8', env: Object.assign({}, process.env) });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const MUTS = [
  { id: 'M1', file: RL, desc: 'همیشه-مجاز (allowed:true)',
    good: '      allowed: current <= limit,', bad: '      allowed: true,',
    cmd: UNIT, expect: 'RL-b' },
  { id: 'M2', file: RL, desc: 'بدونِ TTL (پنجره منقضی نمی‌شود)',
    good: '    if (current === 1) {', bad: '    if (false) {',
    cmd: UNIT, expect: 'RL-f' },
  { id: 'M3', file: AUTH, desc: 'دورزدنِ سقفِ phone در auth',
    good: "    if(!rPh.allowed) return sendJson(res, 429, { ok: false, code: 'rate_limited' });",
    bad: "    if(false) return sendJson(res, 429, { ok: false, code: 'rate_limited' });",
    cmd: FULL, expect: 'FB-a' },
  { id: 'M4', file: RL, desc: 'باقیماندهٔ ثابت (remaining:limit)',
    good: '      remaining: Math.max(0, limit - current),', bad: '      remaining: limit,',
    cmd: UNIT, expect: 'RL-c' },
];

let killed = 0, survived = 0;
for (const m of MUTS) {
  const orig = fs.readFileSync(m.file, 'utf8');
  if (orig.indexOf(m.good) < 0) {
    console.log('  ⚠️ ' + m.id + ' ' + m.desc + ' — لنگر پیدا نشد (پوشش از دست رفت!)');
    survived++;
    continue;
  }
  fs.writeFileSync(m.file, orig.replace(m.good, m.bad));
  let res;
  try {
    res = run(m.cmd);
  } finally {
    fs.writeFileSync(m.file, orig); /* بازگردانیِ حتمی */
  }
  const red = res.code !== 0 && res.out.indexOf('❌ ' + m.expect) >= 0;
  if (red) { killed++; console.log('  ✅ ' + m.id + ' ' + m.desc + ' کشته شد (' + m.expect + ' قرمز)'); }
  else {
    survived++;
    console.log('  ❌ ' + m.id + ' ' + m.desc + ' زنده ماند! exit=' + res.code);
    console.log(res.out.slice(-600));
  }
}

/* سبزِ نهایی: جهش‌ها واقعاً برگشته‌اند */
const fin = run(UNIT);
const green = fin.code === 0;
console.log('\nrate-limit-mutations: ' + killed + '/4 کشته، ' + survived + ' زنده؛ سبزِ نهایی: ' + (green ? '✅' : '❌'));
process.exit(survived || !green ? 1 : 0);
