'use strict';
/* tests/m15-09-field-crypto-wiring.js — M15-09: سیم‌کشیِ رمز سطح-فیلد در
   مرزهایِ ماندگاری (follow-upِ مستندِ ردیفِ ۲۳ صف):
     ۱. مرزِ persistِ PG (db.js persistOpWithClient)
     ۲. مرزهایِ خواندن (readCollection/readOne/hydrate — decryptRows)
     ۳. مرزِ snapshotِ JSON (index.js: worker getStore + persistStoreSync + loadStore)

   Y1  persist: مقدارِ phone/national_id در پارامترهایِ SQL = envelope،
       plaintext غایب (کلید تنظیم‌شده).
   Y2  read-pipe: decryptRows روی سطرِ envelope = plaintext + سیم‌کشیِ
       استاتیکِ سه مسیر در db.js و index.js (الگویِ تستِ استاتیکِ wave5).
   Y3  fail-closed: envelope دستکاری‌شده = FIELD_CRYPTO_DECRYPT_FAILED (بلند).
   Y4  snapshot JSON: کپیِ رمزشده — RAM دست‌نخورده؛ بازکردن = plaintext.
   Y5  اثباتِ منفیِ سیم‌کشی: crypto ساختگیِ passthrough → persist بدونِ
       envelope (assertion وارونه) → بازگشت → دوباره envelope — یعنی
       تست به «مشورتِ واقعی با crypto» وابسته است، نه یک رشتهٔ هاردکد.
   Y6  پیش‌فرضِ بدونِ کلید (فرایندِ فرزند): passthrough کامل — هیچ
       envelopeای — رفتارِ پیشینِ همهٔ سوئیت‌ها حفظ می‌شود.

   Run: node tests/m15-09-field-crypto-wiring.js */

const { execFileSync } = require('child_process');
const assert = require('assert');

/* کلید پیش از require (parseKeys در ساختِ نمونه) */
const KEY_B64 = Buffer.alloc(32, 7).toString('base64');
process.env.PAYESH_FIELD_ENC_KEYS = 'testkid:' + KEY_B64;
process.env.PAYESH_FIELD_ENC_KID = 'testkid';

const db = require('../server/db.js');
const fcs = require('../server/field-crypto-store.js');
const fs = require('fs');
const path = require('path');
const { PREFIX } = require('../server/field-crypto.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function fakeClient() {
  return {
    queries: [],
    query: async function (t, params) { this.queries.push({ sql: t, params: params || [] }); return { rows: [], rowCount: 1 }; },
    release: function () {}
  };
}
function fakePool(client) {
  return { connect: async () => client, query: async (t, p) => client.query(t, p), end: async () => {} };
}

(async () => {
  console.log('\n▸ M15-09 — سیم‌کشیِ رمز سطح-فیلد در مرزهایِ ماندگاری');

  /* Y1 — مرزِ persistِ PG */
  {
    db.__setPoolForTests(fakePool(fakeClient()));
    const c = fakeClient();
    db.__setPoolForTests((function () { const p = fakePool(c); return p; })());
    const op = { uid: 'y1-1', c: 'users', t: 'ins', data: { id: 9001, school_id: 1, full_name: 'علی', phone: '09120000000', national_id: '0012345678', role: 'student' } };
    await db.persistOpWithClient(c, op);
    const ins = c.queries.find((q) => q.sql.indexOf('INSERT INTO "users"') === 0);
    chk('Y1a INSERT users صادر شد', !!ins);
    const phoneParam = ins && ins.params.find((v) => typeof v === 'string' && v.indexOf('09120000000') > -1);
    chk('Y1b plaintextِ phone در پارامترها غایب', !phoneParam);
    const envelope = ins && ins.params.find((v) => typeof v === 'string' && v.indexOf(PREFIX) === 0);
    chk('Y1c پارامترِ envelope (payesh-fenc:v1) در SQL هست', !!envelope, envelope && envelope.slice(0, 40));
    db.__setPoolForTests(null);
  }

  /* Y2 — سیم‌کشیِ read-pipe (استاتیک + واحد) */
  {
    const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'db.js'), 'utf8');
    chk('Y2a readCollection = decryptRows', dbSrc.includes('return fcs.decryptRows(name, stripInternalColumns(reviveRows(res.rows)));'));
    chk('Y2b readOne = همان لوله', dbSrc.includes('const rows = fcs.decryptRows(name, stripInternalColumns(reviveRows(res.rows)));'));
    chk('Y2c hydrateِ سقف‌دار = همان لوله', dbSrc.includes('rows = fcs.decryptRows(key, stripInternalColumns(reviveRows(res.rows)));'));
    chk('Y2d persist = encryptRowValues', dbSrc.includes('data = fcs.encryptRowValues(col, data) || data;'));
    const idxSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
    chk('Y2e loadStore = decryptRows', idxSrc.includes("s.users = fcs.decryptRows('users', s.users);"));
    chk('Y2f worker getStore = snapshotِ رمز', idxSrc.includes('getStore: () => fcs.storeSnapshotForPersist(store)'));
    chk('Y2g persistStoreSync = snapshotِ رمز', idxSrc.includes('stringifyAscii(fcs.storeSnapshotForPersist(store))'));
    /* واحدِ لوله: سطرِ envelope → plaintext */
    const envPhone = fcs.encryptRowValues('users', { phone: '09120000000' }).phone;
    const back = fcs.decryptRows('users', [{ id: 1, phone: envPhone, national_id: '0012345678' }]);
    chk('Y2h بازکردنِ سطرِ envelope = plaintext', back[0].phone === '09120000000', back[0].phone);
  }

  /* Y3 — fail-closed روی دستکاری */
  {
    const good = fcs.encryptRowValues('users', { national_id: '0012345678' }).national_id;
    const tampered = good.slice(0, -4) + 'AAAA';
    let threw = null;
    try { fcs.decryptRowValues('users', { national_id: tampered }); }
    catch (e) { threw = e; }
    chk('Y3a دستکاری = FIELD_CRYPTO_DECRYPT_FAILED', threw && threw.code === 'FIELD_CRYPTO_DECRYPT_FAILED', threw && threw.code);
  }

  /* Y4 — snapshotِ JSON: RAM دست‌نخورده، فایلِ رمز */
  {
    const store = { users: [{ id: 1, phone: '09120000000', national_id: '0012345678' }], announcements: [] };
    const snap = fcs.storeSnapshotForPersist(store);
    chk('Y4a snapshot: phone = envelope', typeof snap.users[0].phone === 'string' && snap.users[0].phone.indexOf(PREFIX) === 0);
    chk('Y4b RAM (store اصلی) plaintext ماند', store.users[0].phone === '09120000000');
    const back = fcs.decryptRows('users', snap.users);
    chk('Y4c بازکردنِ snapshot = plaintextِ کامل', back[0].phone === '09120000000' && back[0].national_id === '0012345678');
  }

  /* Y5 — اثباتِ منفیِ سیم‌کشی */
  {
    const passthrough = { isReady: () => true, encryptField: (v) => String(v), decryptField: (v) => String(v) };
    fcs.__setForTests(passthrough);
    const c = fakeClient();
    try {
      await db.persistOpWithClient(c, { uid: 'y5-1', c: 'users', t: 'ins', data: { id: 9002, school_id: 1, phone: '09130000000', role: 'student' } });
    } finally { fcs.__setForTests(null); }
    const ins = c.queries.find((q) => q.sql.indexOf('INSERT INTO "users"') === 0);
    chk('Y5a با cryptoِ passthrough: plaintext در SQL (تستِ وابسته به cryptoِ واقعی)', ins && ins.params.some((v) => v === '09130000000'));
    const c2 = fakeClient();
    await db.persistOpWithClient(c2, { uid: 'y5-2', c: 'users', t: 'ins', data: { id: 9003, school_id: 1, phone: '09130000000', role: 'student' } });
    const ins2 = c2.queries.find((q) => q.sql.indexOf('INSERT INTO "users"') === 0);
    chk('Y5b پس از بازگشت: دوباره envelope', ins2 && ins2.params.some((v) => typeof v === 'string' && v.indexOf(PREFIX) === 0));
  }

  /* Y6 — پیش‌فرضِ بدونِ کلید (فرایندِ فرزند، envِ پاک‌شده) */
  {
    const script = `
      const fcs = require('./server/field-crypto-store.js');
      const assert = require('assert');
      const row = { phone: '09120000000' };
      const out = fcs.encryptRowValues('users', row);
      assert(out === row, 'بدونِ کلید = همان سطر (passthrough)');
      const snap = fcs.storeSnapshotForPersist({ users: [row] });
      assert(snap.users[0].phone === '09120000000', 'snapshot بدونِ کلید = plaintext');
      console.log('Y6-OK');
    `;
    const cleanEnv = Object.assign({}, process.env);
    delete cleanEnv.PAYESH_FIELD_ENC_KEYS;
    delete cleanEnv.PAYESH_FIELD_ENC_KEY;
    delete cleanEnv.PAYESH_FIELD_ENC_KID;
    let out = '';
    try {
      out = execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: cleanEnv });
    } catch (e) { out = ((e && e.stdout) || '') + ((e && e.stderr) || '') + ((e && e.message) || ''); }
    chk('Y6 پیش‌فرضِ بدونِ کلید = passthrough کامل (رفتارِ پیشین)', out.indexOf('Y6-OK') > -1, out.trim().slice(0, 80));
  }

  console.log('────────────────────────────────────────────');
  console.log('m15-09-field-crypto-wiring: ' + okc + ' pass / ' + failc + ' fail');
  console.log('CHECKS ' + (okc + failc) + ' FAIL ' + failc);
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e && e.message)); process.exit(1); });
