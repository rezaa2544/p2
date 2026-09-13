#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave16-dr-mutations.js — Wave 16 mutation testing
   ───────────────────────────────────────────────────────────────────
   Each mutation removes one Disaster-Recovery safety property from
   server/dr.js. A surviving mutation means tests/wave16-dr.js does not
   actually protect that property.

   Y1  checksum comparison faked      (corrupt backup "verifies")   ⇒ ❌ D3e
   Y2  decrypt returns data unverified (tampered archive "succeeds") ⇒ ❌ D4k
   Y3  structural check bypassed      (wrong data restores)         ⇒ ❌ D3f
   Y4  structure ignored in the gate  (same, other half)            ⇒ ❌ D3f
   Y5  off-site target guard removed  (same disk called off-site)   ⇒ ❌ D5b
   Y6  drill never actually tampers   (crypto never exercised)      ⇒ ❌ D8a
   Y7  RTO gate not part of ok        (slow restore passes)         ⇒ ❌ D12a
   Y8  backup-name validation removed (path traversal)              ⇒ ❌ D10a

   اجرا:  node tests/wave16-dr-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانی حذف شد (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('w16d-mut-');
const SUITE = path.join(ROOT, 'tests', 'wave16-dr.js');
const F = path.join(ROOT, 'server', 'dr.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}
function runSuite(e) {
  return spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 600000, env: e });
}

console.log('▸ خطِّ پایه');
const base = runSuite();
chk('خطِّ پایهٔ wave16-dr سبز است', base.status === 0, (base.stdout || '').slice(-200));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(find, replace, killRe, tag) {
  const orig = fs.readFileSync(F, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false, 'anchor missing'); return; }
    const mcopy = kit.mutant(F, orig.replace(find, replace)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(F).mode); } catch (_) {}
    const r = runSuite(kit.env());
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-260).replace(/\n/g, ' '));
  } finally {
    kit.clear(F); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */
  }
}

console.log('\n▸ جهش‌ها');

/* Y1 — the whole point of a checksum */
mutate(
  `    res.checks.sha256_matches_manifest = entry ? entry.sha256 === sha : false;`,
  `    res.checks.sha256_matches_manifest = true; /* جهش: مقایسهٔ checksum جعل شد */`,
  /❌ D3e/, 'Y1 جعلِ مقایسهٔ checksum');

/* Y2 — a "lenient" decrypt: the classic way an integrity check gets removed.
   (Note: merely dropping setAuthTag would NOT survive — Node throws at final()
   and the catch still reports authentication_failed. This mutation is the one
   that actually models the regression.) */
mutate(
  `      const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
      if (sha256Buf(plain) !== header.plain_sha256) return { ok: false, reason: 'checksum_mismatch' };`,
  `      let plain;
      try { plain = Buffer.concat([decipher.update(ct), decipher.final()]); }
      catch (eAuth) { plain = ct; }
      /* جهش: نتیجه بدونِ راستی‌آزمایی برگردانده می‌شود */`,
  /❌ D4k/, 'Y2 رمزگشاییِ بدونِ راستی‌آزمایی');

/* Y3 — structural validation is the half that catches "consistent but wrong" */
mutate(
  `    const insp = inspectData(data);
    res.checks.structure_ok = insp.ok;
    res.problems = insp.problems;
    res.counts = insp.counts;`,
  `    const insp = { ok: true, problems: [], counts: {} }; /* جهش: بررسیِ ساختار رد شد */
    res.checks.structure_ok = insp.ok;
    res.problems = insp.problems;
    res.counts = insp.counts;`,
  /❌ D3f/, 'Y3 ردکردنِ بررسیِ ساختار');

/* Y4 — the other half: structure checked but not gating */
mutate(
  `    res.ok = res.checks.sha256_matches_manifest === true && insp.ok;`,
  `    res.ok = res.checks.sha256_matches_manifest === true; /* جهش: ساختار دروازه نیست */`,
  /❌ D3f/, 'Y4 ساختار بدونِ اثر در دروازه');

/* Y5 — "off-site" on the same disk is a lie that reads as a green control */
mutate(
  `    if (abs === dataAbs || abs.indexOf(dataAbs + path.sep) === 0) {
      return { ok: false, reason: 'target_inside_data_dir' };
    }`,
  `    /* جهش: مقصدِ داخلِ پوشهٔ داده پذیرفته می‌شود */`,
  /❌ D5b/, 'Y5 پذیرشِ مقصدِ هم‌دیسک به‌عنوانِ برون‌سایتی');

/* Y6 — a drill that reports a tamper test without tampering proves nothing */
mutate(
  `        blob[at] = blob[at] ^ 0xff;`,
  `        /* جهش: هیچ بایتی دستکاری نمی‌شود — مانورِ بی‌اثر */`,
  /❌ D8a/, 'Y6 مانور بدونِ دستکاریِ واقعی');

/* Y7 — an RTO objective that never gates is decoration */
mutate(
  `      report.ok = phases.every((p) => p.ok) && report.within_rto === true;`,
  `      report.ok = phases.every((p) => p.ok); /* جهش: RTO دروازه نیست */`,
  /❌ D12a/, 'Y7 حذفِ دروازهٔ RTO');

/* Y8 — name validation is what keeps a traversal string off the disk path */
mutate(
  `    if (!NAME_RE.test(String(name || ''))) { res.reason = 'invalid_name'; return res; }`,
  `    /* جهش: اعتبارسنجیِ نام حذف شد */`,
  /❌ D10a/, 'Y8 حذفِ اعتبارسنجیِ نامِ پشتیبان');

console.log('\n▸ بازگردانی');
const fin = runSuite();
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0, (fin.stdout || '').slice(-160));
chk('server/dr.js بدونِ باقی‌ماندهٔ جهش است', fs.readFileSync(F, 'utf8').indexOf('جهش:') < 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های ویو ۱۶: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
