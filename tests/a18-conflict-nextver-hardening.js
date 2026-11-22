#!/usr/bin/env node
/* a18-conflict-nextver-hardening.js — A-18 بازِ «بازگشتِ نسخه» در resolve-conflict
   ──────────────────────────────────────────────────────────────────────────
   حفرهٔ تاریخی: nextVer = (Number(c.server_version) || 1) + 1 — اگر
   server_versionِ تعارض NaN/غایب باشد، گاردِ conflict_stale هم (به‌دلیلِ
   Number.isFinite) رد می‌شود و فرمول «۲» می‌دهد؛ یعنی رکوردِ v10 به v2
   rewind می‌شد.
   هاردنینگ: nextVer = max(نسخهٔ فعلیِ هدف، اسنپ‌شاتِ finite) + 1.
   ──────────────────────────────────────────────────────────────────────────
   اجرا: node tests/a18-conflict-nextver-hardening.js   (بدون PG/Redis)
   ────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
const chk = (name, cond) => {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
};

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server', 'conflicts.js'), 'utf8');

/* T1..T3: قراردادِ ایستای هاردنینگ */
chk('T1 nextVer با Math.max(curV, snapV) مشتق می‌شود',
  /const\s+nextVer\s*=\s*Math\.max\(curV,\s*snapV\)\s*\+\s*1;/.test(SRC));
chk('T2 اسنپ‌شاتِ غیرfinite به نسخهٔ فعلیِ هدف fallback می‌شود (نه ۱ ثابت)',
  /Number\.isFinite\(Number\(c\.server_version\)\)\s*\?\s*Number\(c\.server_version\)\s*:\s*curV/.test(SRC));
chk('T3 فرمولِ قدیمیِ rewind‌زا دیگر در فایل نیست',
  !/\(\s*Number\(c\.server_version\)\s*\|\|\s*1\s*\)\s*\+\s*1/.test(SRC));

/* T4..T6: اثباتِ منفیِ رفتاری — شبیه‌سازیِ هر دو فرمول روی همان ورودی‌ها.
   فرمولِ قدیمی باید روی حفرهٔ NaN «۲» بدهد (rewind از ۱۰)؛ فرمولِ جدید «۱۱». */
function oldFormula(targetVersion, serverVersion) {
  const c = { server_version: serverVersion }; const target = { version: targetVersion };
  const expectedVersion = Number(c.server_version);
  const currentVersion = target && Number(target.version);
  /* همان گاردِ فعلیِ فایل — NaN هر دو سو را رد می‌کند */
  const guarded = target && Number.isFinite(expectedVersion)
    && Number.isFinite(currentVersion) && currentVersion !== expectedVersion;
  if (guarded) return { blocked: true, v: currentVersion }; /* 409 — rewind نمی‌شود */
  return { blocked: false, v: (Number(c.server_version) || 1) + 1 };
}
function newFormula(targetVersion, serverVersion) {
  const c = { server_version: serverVersion }; const target = { version: targetVersion };
  const wasExisting = !!target;
  const curV = wasExisting ? (Number(target.version) || 0) : 0;
  const snapV = Number.isFinite(Number(c.server_version)) ? Number(c.server_version) : curV;
  return { blocked: false, v: Math.max(curV, snapV) + 1 };
}
const hole = oldFormula(10, NaN);
chk('T4 فرمولِ قدیمی روی حفرهٔ NaN از v10 به v2 rewind می‌کرد (اثباتِ حفره)',
  !hole.blocked && hole.v === 2);
const hardened = newFormula(10, NaN);
chk('T5 هاردنینگ روی همان حفره v11 می‌دهد (بدونِ rewind)', hardened.v === 11);
chk('T6 مسیرِ سالم تغییر نکرده: snapshot=9 و target=9 → 10',
  newFormula(9, 9).v === 10);

console.log('\na18-conflict-nextver-hardening: ' + (ok + fail) + ' بررسی — ✅ ' + ok + ' · ❌ ' + fail);
process.exit(fail ? 1 : 0);
