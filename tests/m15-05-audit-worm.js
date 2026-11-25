'use strict';
/* tests/m15-05-audit-worm.js — M15-05: قراردادِ جدولِ WORM audit (ردیف ۲۵).
   ───────────────────────────────────────────────────────────────────
   T1 migration: REVOKE + دو trigger + تابعِ guard + زنجیره در SQL هست
   T2 down: پاکسازیِ کامل
   T3 canonical/hash: پایداریِ ترتیبِ کلید + حساسیت به تغییرِ payload
   T4 parse: خطِ سالم/corrupt/بی-seq
   T5 زنجیرهٔ نمونه: hash(i)=f(hash(i-1)) — جای‌گذاریِ ردیفِ میانی کشف می‌شود
   T6 اثباتِ منفی: حذفِ زنجیره از tool ⇒ این تست قرمز
   T7 fail-closed: هر دو حالتِ tool بدونِ PG زنده = PG_REQUIRED (فالس‌گرینِ
      verifyِ «rows=0» ممنوع — db.init + isPostgres پیش از هر query)
   T8 fp (migration 029): اثرِ انگشتِ payload = پایدار و حساس به تغییر
   T9 import idempotent: fp-dup → skip؛ seq از دنبالهٔ جدول
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
  chk('T1e transactional (BEGIN/COMMIT — قراردادِ db-engineering)', /^\s*BEGIN;\s*$/m.test(mig) && /^\s*COMMIT;\s*$/m.test(mig) && !/\bDROP\s+TABLE\b/i.test(mig));

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

  /* T7 — fail-closed مشترک: verifyِ بدونِ PG نباید «rows=0» سبز چاپ کند */
  chk('T7a tool دیتابیس را init می‌کند', tool.includes('await db.init()'));
  chk('T7b گیتِ isPostgres پیش از هر query', /if \(!db\.isPostgres\(\)\)/.test(tool) && tool.indexOf('!db.isPostgres()') < tool.indexOf('SELECT seq, payload, prev_hash, hash'));
  chk('T7c PG_REQUIRED با exit 2 در هر دو حالت', (tool.match(/PG_REQUIRED/g) || []).length >= 2 && (tool.match(/process\.exit\(2\)/g) || []).length >= 2);
  chk('T7d verify بدونِ ردیفِ قابل‌اعتماد = خطا (نه سبز)', tool.includes('PG_VERIFY_FAILED'));

  /* T8 — fp (migration 029): اثرِ انگشتِ payload */
  const fp = (o) => crypto.createHash('sha256').update(canonical(o), 'utf8').digest('hex').slice(0, 32);
  chk('T8a migration 029 = ستونِ fp + ایندکسِ یکتا', (() => {
    const m = fs.readFileSync(path.join(__dirname, '..', 'migrations', '029_audit_worm_fp.sql'), 'utf8');
    return m.includes('ADD COLUMN IF NOT EXISTS fp TEXT') && m.includes('CREATE UNIQUE INDEX IF NOT EXISTS audit_events_worm_fp_key');
  })());
  chk('T8b downِ 029 = حذفِ کامل', (() => {
    const d = fs.readFileSync(path.join(__dirname, '..', 'migrations', '029_audit_worm_fp.down.sql'), 'utf8');
    return d.includes('DROP INDEX IF EXISTS audit_events_worm_fp_key') && d.includes('DROP COLUMN IF EXISTS fp');
  })());
  chk('T8c fp = پایدار و مستقل از ترتیبِ کلید', fp({ b: 2, a: 1 }) === fp({ a: 1, b: 2 }));
  chk('T8d fp = حساس به تغییرِ payload', fp({ a: 1 }) !== fp({ a: 2 }));

  /* T9 — import idempotent با fp */
  chk('T9a tool fp را محاسبه و dedup می‌کند', tool.includes('fingerprint(p.payload)') && tool.includes('seen.has(fp)'));
  chk('T9b seq از دنبالهٔ جدول برای خطِ بی-seq', tool.includes('else seq = lastSeq + 1'));
  chk('T9c insert ستونِ fp را می‌نویسد', tool.includes('fp, prev_hash, hash'));

  console.log('────────────────────────────────────────────');
  console.log('m15-05-audit-worm: ' + ok + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (ok + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e && e.message)); process.exit(1); });
