#!/usr/bin/env node
/* tests/rate-limit-mutations.js — جهش‌ها باید کشته شوند (تست‌ها باید قرمز شوند).
   M1/M2/M4 روی --unit-only (بدونِ Redis)؛ M3 با بوتِ FB (fallback). بدونِ وابستگی به redis-server. */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
/* BH-mut (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی هرگز بازنویسی نمی‌شود. */
const { session } = require('./helpers/mutant-kit');
const kit = session('rl-mut-');

const ROOT = path.join(__dirname, '..');
const RL = path.join(ROOT, 'server', 'rate-limit.js');
const RDS = path.join(ROOT, 'server', 'redis.js');
const AUTH = path.join(ROOT, 'server', 'auth.js');
const SUITE = path.join(__dirname, 'rate-limit-distributed.js');

const UNIT = [process.execPath, SUITE, '--unit-only'];
const FULL = [process.execPath, SUITE];

function run(argv, timeoutMs, env) {
  const r = cp.spawnSync(argv[0], argv.slice(1), { cwd: ROOT, timeout: timeoutMs || 240000,
    encoding: 'utf8', env: env || Object.assign({}, process.env) });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const MUTS = [
  { id: 'M1', file: RL, desc: 'همیشه-مجاز (allowed:true)',
    good: '      allowed: current <= limit,', bad: '      allowed: true,',
    cmd: UNIT, expect: 'RL-b' },
  { id: 'M2', file: RDS, desc: 'بدونِ TTL (پنجره منقضی نمی‌شود)',
    good: '  if (t === -1 && ttlSeconds > 0) await module.exports.expire(key, ttlSeconds);',
    bad: '  if (false) await module.exports.expire(key, ttlSeconds);',
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
  kit.mutant(m.file, orig.replace(m.good, m.bad)); /* کپی جدا؛ بدونِ بازگردانیِ دستی */
  const res = run(m.cmd, undefined, kit.env());
  const red = res.code !== 0 && res.out.indexOf('❌ ' + m.expect) >= 0;
  if (red) { killed++; console.log('  ✅ ' + m.id + ' ' + m.desc + ' کشته شد (' + m.expect + ' قرمز)'); }
  else {
    survived++;
    console.log('  ❌ ' + m.id + ' ' + m.desc + ' زنده ماند! exit=' + res.code);
    console.log(res.out.slice(-600));
  }
}

/* سبزِ نهایی: بدونِ env → سورس‌های اصلی */
const fin = run(UNIT);
kit.cleanup();
const green = fin.code === 0;
console.log('\nrate-limit-mutations: ' + killed + '/4 کشته، ' + survived + ' زنده؛ سبزِ نهایی: ' + (green ? '✅' : '❌'));
process.exit(survived || !green ? 1 : 0);
