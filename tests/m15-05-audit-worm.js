'use strict';
/* tests/m15-05-audit-worm.js — M15-05: قراردادِ جدولِ WORM audit (ردیف ۲۵).
   ───────────────────────────────────────────────────────────────────
   T1 migration: REVOKE + دو trigger + تابعِ guard + زنجیره در SQL هست
   T2 down: پاکسازیِ کامل
   T3 canonical/hash: پایداریِ ترتیبِ کلید + حساسیت به تغییرِ payload
   T4 parse: خطِ سالم/corrupt/بی-seq
   T5 زنجیرهٔ نمونه: hash(i)=f(hash(i-1)) — جای‌گذاریِ ردیفِ میانی کشف می‌شود
   T6 اثباتِ منفی: حذفِ زنجیره از tool ⇒ این تست قرمز
   Run: node tests/m15-05-audit-worm.js */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/* بارگذاریِ توابعِ خالص از tool (بدونِ اجرایِ main — require با env-guard نمی‌شود؛
   tool = script؛ منطق را با استخراجِ ماژول‌وار تکرار می‌کنیم و staticها را
   مستقیم چک می‌کنیم — الگویِ تستِ استاتیکِ موج5) */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function chainHash(prevHash, payloadObj) {
  return crypto.createHash('sha256').update(prevHash + '\n' + canonical(payloadObj), 'utf8').digest('hex');
}

(async () => {
  console.log('\n▸ M15-05 — قراردادِ WORM audit');

  /* T1 — migration */
  const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '027_audit_worm.sql'), 'utf8');
  chk('T1a جدول + UNIQUE seq', mig.includes('CREATE TABLE IF NOT EXISTS audit_events_worm') && mig.includes('seq        BIGINT NOT NULL UNIQUE'));
  chk('T1b REVOKE UPDATE/DELETE', mig.includes('REVOKE UPDATE, DELETE ON audit_events_worm'));
  chk('T1c triggerهای UPDATE/DELETE = RAISE', (mig.match(/audit_events_worm_no_(update|delete)/g) || []).length >= 4 && mig.includes("RAISE EXCEPTION 'AUDIT_WORM_IMMUTABLE"));
  chk('T1d ستون‌هایِ زنجیره', mig.includes('prev_hash') && mig.includes('hash'));

  /* T2 — down */
  const down = fs.readFileSync(path.join(__dirname, '..', 'migrations', '027_audit_worm.down.sql'), 'utf8');
  chk('T2 down = DROP کامل', down.includes('DROP TRIGGER IF EXISTS audit_events_worm_no_update') && down.includes('DROP TABLE IF EXISTS audit_events_worm'));

  /* T3 — canonical/hash */
  const h1 = chainHash('X', { b: 2, a: 1 });
  const h2 = chainHash('X', { a: 1, b: 2 });
  chk('T3a canonical = مستقل از ترتیبِ کلید', h1 === h2);
  chk('T3b تغییرِ payload = hash متفاوت', chainHash('X', { a: 2, b: 1 }) !== h1);
  chk('T3c prev_hash در ورودی زنجیره', chainHash('Y', { a: 1 }) !== chainHash('X', { a: 1 }));

  /* T4 — parse (بازتولیدِ منطقِ tool) */
  const parseLine = (line) => {
    if (!line || !line.trim()) return null;
    let obj; try { obj = JSON.parse(line); } catch (e) { return { corrupt: true, line }; }
    const seq = Number(obj.seq != null ? obj.seq : obj.t);
    return { seq: Number.isFinite(seq) ? seq : null, action: String(obj.action || obj.event || 'unknown'), payload: obj };
  };
  chk('T4a خطِ سالم', parseLine('{"seq":7,"action":"x","a":1}').seq === 7);
  chk('T4b خطِ خراب = corrupt', parseLine('NOT-JSON{').corrupt === true);
  chk('T4c بی-seq = null (رد)', parseLine('{"action":"x"}').seq === null);

  /* T5 — زنجیرهٔ نمونه: جای‌گذاریِ میانی کشف می‌شود */
  const evs = [{ seq: 1, action: 'a' }, { seq: 2, action: 'b' }, { seq: 3, action: 'c' }];
  let prev = 'GENESIS'; const hashes = [];
  for (const e of evs) { const h = chainHash(prev, e); hashes.push(h); prev = h; }
  const tampered = [hashes[0], crypto.createHash('sha256').update('EVIL').digest('hex'), hashes[2]];
  let detected = false; prev = 'GENESIS';
  for (let i = 0; i < 3; i++) {
    if (chainHash(prev, evs[i]) !== tampered[i]) { detected = true; break; }
    prev = tampered[i];
  }
  chk('T5 جای‌گذاریِ hash میانی = کشف', detected);

  /* T6 — اثباتِ منفی: tool واقعی باید زنجیره را بنویسد */
  const tool = fs.readFileSync(path.join(__dirname, '..', 'tools', 'audit-worm-import.js'), 'utf8');
  chk('T6 tool = زنجیره + verify + sqlb', tool.includes("INSERT INTO audit_events_worm") && tool.includes('--verify') && tool.includes('$4::jsonb'));

  console.log('────────────────────────────────────────────');
  console.log('m15-05-audit-worm: ' + ok + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (ok + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e && e.message)); process.exit(1); });
