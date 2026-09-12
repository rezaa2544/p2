#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave6-11-redis-live-mutations.js — اثباتِ اینکه گیتِ زندهٔ Redis
   واقعاً نقضِ قرارداد را می‌گیرد (سبزِ جعلی ممنوع).
   هر جهش: نقضی عمدی در server/redis.js یا server/cache.js تزریق و
   tests/wave6-11-redis-live.js اجرا می‌شود — باید قرمز شود؛ بعد restore.
   بدون redis-server در PATH: self-skip (مثل خودِ گیت).
   اجرا: PATH=...redis-dir:$PATH node tests/wave6-11-redis-live-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function hasRedis() {
  if (process.env.REDIS_LIVE_URL) return true;
  try { return !!cp.execSync('which redis-server', { stdio: 'pipe' }).toString().trim(); }
  catch (e) { return false; }
}
if (!hasRedis()) {
  console.log('  ⏭️  live redis mutations — redis-server در PATH نیست');
  console.log('wave6-11-redis-live-mutations: 0/0 (skip)؛ سبزِ نهایی: ✅');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const RED = path.join(ROOT, 'server', 'redis.js');
const CCH = path.join(ROOT, 'server', 'cache.js');
const originals = new Map();
for (const f of [RED, CCH]) originals.set(f, fs.readFileSync(f, 'utf8'));
function restore() { for (const [f, s] of originals) fs.writeFileSync(f, s, 'utf8'); }

const mutations = [
  {
    name: 'setNX دیگر NX نباشد (هر رقیب برنده شود — قفلِ توزیع‌شده می‌شکند)',
    file: RED,
    find: (s) => {
      const i = s.indexOf("'NX'");
      return i !== -1;
    },
    mutate: (s) => s.replace(/'NX',\s*/g, '').replace(/'NX'\)/g, "'XX')")
  },
  {
    name: 'compareAndDelete بدونِ مقایسه حذف کند (صاحب‌سنجی می‌میرد)',
    file: RED,
    mutate: (s) => s.replace(
      'const reply = await client.eval(CAS_DEL_SCRIPT, 1, key, expectedValue);',
      'const reply = 1; await client.del(key); /* MUTANT: unconditional delete */')
  },
  {
    name: 'invalidateSchool هیچ کاری نکند (ابطالِ گروهی می‌میرد)',
    file: CCH,
    mutate: (s) => s.replace(
      'async function invalidateSchool(schoolId) {',
      'async function invalidateSchool(schoolId) { return; /* MUTANT */')
  },
  {
    name: 'اعتبارسنجیِ epoch در خوانشِ L2 حذف شود (W11-2 برمی‌گردد)',
    file: CCH,
    /* خودِ مقایسهٔ epoch را همیشه-معتبر می‌کنیم — خوانشِ کهنه دیگر رد نمی‌شود */
    mutate: (s) => s.replace(
      "if ((parsed.se || null) !== (curSe || null) || (parsed.ge || null) !== (curGe || null)) {",
      'if (false) { /* MUTANT: epoch check disabled */')
  },
  {
    name: 'single-flight حذف شود (هر خواننده خودش تولید کند)',
    file: CCH,
    mutate: (s) => s.replace(
      'const pend = inflight.get(key);',
      'const pend = null; /* MUTANT: no coalescing */')
  }
];

let killed = 0, applied = 0;
for (const m of mutations) {
  const src = originals.get(m.file);
  const mutated = m.mutate(src);
  if (mutated === src) { console.error('  ⚠️ جهش «' + m.name + '» اعمال نشد (الگو پیدا نشد)'); continue; }
  applied++;
  fs.writeFileSync(m.file, mutated, 'utf8');
  let red = false;
  try {
    cp.execFileSync('node', [path.join(ROOT, 'tests', 'wave6-11-redis-live.js')],
      { stdio: 'pipe', env: process.env, timeout: 180000 });
  } catch (e) { red = true; }
  restore();
  if (red) { killed++; console.log('  🗡️ کشته شد: ' + m.name); }
  else console.error('  ❌ زنده ماند: ' + m.name);
}
restore();

const ok = applied === mutations.length && killed === applied;
console.log(`wave6-11-redis-live-mutations: ${killed}/${mutations.length} کشته؛ سبزِ نهایی: ${ok ? '✅' : '❌'}`);
process.exit(ok ? 0 : 1);
