#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   otp-ratelimit-mutations.js — جهش‌مندیِ OTP (R101)
   ─────────────────────────────────────────────────────────────
   M1 کد برگردد به ۴ رقم ← R1
   M2 cooldown خاموش ← R8 (cooldownِ مشترک دیده نمی‌شود)
   M3 سقفِ روزانه خاموش ← R3
   M4 سقفِ phone خاموش ← R2
   M5 سقفِ IP در ارسال خاموش ← R4
   M6 سقفِ IP در login خاموش ← R5
   M7 مقایسهٔ hash همیشه-درست (خود-مقایسه) ← R6
   (تغییرها فقط server/ است — نیازی به build نیست.)
   ───────────────────────────────────────────────────────────── */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUITE = 'tests/otp-ratelimit.js';
const F = 'server/auth.js';
const MUTS = [
  { bad: 'String(crypto.randomInt(100000, 1000000))',
    mut: 'String(crypto.randomInt(1000, 10000))',
    name: 'M1 کد برگشت به ۴ رقم', expectFail: 'R1' },
  { bad: "if(now - (cd[phone] || 0) < CODE_COOLDOWN_MS) return sendJson(res, 429, { ok: false, code: 'rate_limited' });",
    mut: "if(false) return sendJson(res, 429, { ok: false, code: 'rate_limited' });",
    name: 'M2 cooldown خاموش شد', expectFail: 'R8' },
  { bad: "const rDaily = await rateLimit.checkRateLimit({ prefix: 'otp:send:phone:day', identifier: phone, limit: CODE_DAILY_MAX, windowSeconds: 86400 });",
    mut: 'const rDaily = { allowed: true };',
    name: 'M3 سقفِ روزانه خاموش شد', expectFail: 'R3' },
  { bad: "const rPh = await rateLimit.checkRateLimit({ prefix: 'otp:send:phone', identifier: phone, limit: PHONE_SEND_MAX, windowSeconds: rlw });",
    mut: 'const rPh = { allowed: true };',
    name: 'M4 سقفِ phone خاموش شد', expectFail: 'R2' },
  { bad: "const rIp = await rateLimit.checkRateLimit({ prefix: 'otp:send:ip', identifier: ip, limit: IP_SEND_MAX, windowSeconds: rlw });",
    mut: 'const rIp = { allowed: true };',
    name: 'M5 سقفِ IP در ارسال خاموش شد', expectFail: 'R4' },
  { bad: "const rLi = await rateLimit.checkRateLimit({ prefix: 'otp:login:ip', identifier: ip, limit: IP_LOGIN_MAX, windowSeconds: Math.max(1, Math.round(WINDOW_MS / 1000)) });",
    mut: 'const rLi = { allowed: true };',
    name: 'M6 سقفِ IP در login خاموش شد', expectFail: 'R5' },
  { bad: 'const a = Buffer.from(hashCode(code, phone));',
    mut: "const a = Buffer.from(rec.h || '0000000000000000000000000000000000000000000000000000000000000000');",
    name: 'M7 مقایسهٔ hash همیشه-درست شد', expectFail: 'R6' },
];

let killed = 0, envFails = 0;
for (const m of MUTS) {
  const fp = path.join(ROOT, F);
  const src0 = fs.readFileSync(fp, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(fp, src0.replace(m.bad, m.mut));
  let out = '', crashed = false;
  const runOnce = () => spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8' });
  try {
    let r = runOnce();
    out = String((r.stdout || '') + (r.stderr || ''));
    if (r.status !== 0 && !/❌/.test(out)) { /* مرگِ زودهنگام؟ یک retry */
      const r2 = runOnce();
      const out2 = String((r2.stdout || '') + (r2.stderr || ''));
      if (r2.status === 0 || /❌/.test(out2)) { r = r2; out = out2; }
    }
    if (/FATAL|JavaScript heap out of memory|aborting/.test(out) || out.trim() === '') crashed = true;
    else if (r.status === 0) out = 'PASSED (no failure)';
  } finally {
    fs.writeFileSync(fp, src0);
  }
  try { execSync('pkill -f "[s]erver/index.js"'); } catch (e) {}
  if (crashed) {
    envFails++;
    console.log(`  ⚠️ ${m.name} — خطایِ محیطی (کرش/بی‌خروجی)، نه «زنده ماندن»`);
    continue;
  }
  const killedThis = /❌/.test(out) && out.includes(m.expectFail);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + ((out.split('\n').find(l => l.includes('❌')) || out.slice(0, 140))) + ')'}`);
  if (killedThis) killed++;
}
let backGreen = false, finalOut = '';
const b = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8' });
finalOut = String((b.stdout || '') + (b.stderr || ''));
backGreen = b.status === 0 && /otp-ratelimit: \d+ ✅ \/ 0 ❌/.test(finalOut);
try { execSync('pkill -f "[s]erver/index.js"'); } catch (e) {}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته · خطِ پایه: ${backGreen ? 'سبز ✅' : 'قرمز ❌'} · خطایِ محیطی: ${envFails}`);
const pass = killed === MUTS.length && backGreen && envFails === 0;
console.log(pass ? 'همهٔ جهش‌ها کشته شدند ✅' : 'جهش‌مندی ناقص ❌');
process.exit(pass ? 0 : 1);
