'use strict';
/* tests/m15-09-field-crypto.test.js — M15-09: AES-256-GCM field-level
   encryption-at-rest for sensitive tenant data.

     F1  the round-trip: encrypt → decrypt = the original plaintext
     F2  the stored value = an envelope, NOT the plaintext (no PII leak in
         the at-rest form) and it is not deterministic (a fresh IV per call)
     F3  fail-closed on tampering: flipping one ciphertext byte = the
         DECRYPT_FAILED error (the GCM auth tag), never a wrong plaintext
     F4  fail-closed on an unknown kid (the rotation incomplete) = a loud
         error, not a silent miss
     F5  rotation: two keys configured; the values encrypted under kid A
         still decrypt AFTER the active kid moves to B (the old rows read)
         and the new writes = under the new kid
     F6  the key contract: no keys configured + required = the loud
         KEY_MISSING error; the envelope format = parseable

   Run: node tests/m15-09-field-crypto.test.js */

const assert = require('assert');
const crypto = require('crypto');
const { createFieldCrypto, PREFIX } = require('../server/field-crypto');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

const kA = crypto.randomBytes(32).toString('base64');
const kB = crypto.randomBytes(32).toString('base64');

(async () => {
  /* F1 — the round-trip */
  {
    process.env.PAYESH_FIELD_ENC_KEYS = 'k1:' + kA;
    delete process.env.PAYESH_FIELD_ENC_KID;
    const fc = createFieldCrypto();
    const nid = '۰۰۱۲۳۴۵۶۷۸';
    const env1 = fc.encryptField(nid);
    check('F1 the round-trip restores the plaintext', fc.decryptField(env1) === nid);
  }

  /* F2 — no plaintext leak + the non-determinism */
  {
    const fc = createFieldCrypto();
    const phone = '09121234567';
    const e1 = fc.encryptField(phone);
    const e2 = fc.encryptField(phone);
    check('F2a the envelope = not the plaintext', !e1.includes(phone) && e1.startsWith(PREFIX), e1.slice(0, 40));
    check('F2b the encryption = non-deterministic (a fresh IV)', e1 !== e2);
    check('F2c the active kid = in the envelope', fc.activeKid() === 'k1' && e1.split(':')[2] === 'k1');
  }

  /* F3 — the tamper = fail-closed */
  {
    const fc = createFieldCrypto();
    const e = fc.encryptField('secret-nid-99');
    const parts = e.split(':');
    const ct = Buffer.from(parts[5], 'base64');
    ct[0] ^= 0xff;
    const tampered = [parts[0], parts[1], parts[2], parts[3], parts[4], ct.toString('base64')].join(':');
    let threw = null;
    try { fc.decryptField(tampered); } catch (err) { threw = err; }
    check('F3 the tampered ciphertext = rejected (the GCM tag)', threw && threw.code === 'FIELD_CRYPTO_DECRYPT_FAILED', threw && threw.code);
  }

  /* F4 — the unknown kid = fail-closed */
  {
    process.env.PAYESH_FIELD_ENC_KEYS = 'k1:' + kA;
    const fc = createFieldCrypto();
    const foreign = PREFIX + 'kZ:AAAAAAAAAAAAAAAAAAAAAA:AAAAAA==:AAAA';
    let threw = null;
    try { fc.decryptField(foreign); } catch (err) { threw = err; }
    check('F4 an unknown kid = a loud error (the rotation incomplete)', threw && threw.code === 'FIELD_CRYPTO_UNKNOWN_KID', threw && threw.code);
  }

  /* F5 — the rotation: the old rows stay readable, the new writes = the new kid */
  {
    process.env.PAYESH_FIELD_ENC_KEYS = 'kA:' + kA;
    delete process.env.PAYESH_FIELD_ENC_KID;
    const old = createFieldCrypto();
    const oldEnv = old.encryptField('nid-under-old-key');
    /* SI-013 rotation: the new key added + the active kid moved */
    process.env.PAYESH_FIELD_ENC_KEYS = 'kA:' + kA + ',kB:' + kB;
    process.env.PAYESH_FIELD_ENC_KID = 'kB';
    const rotated = createFieldCrypto();
    check('F5a the old envelope still decrypts after the rotation', rotated.decryptField(oldEnv) === 'nid-under-old-key');
    const newEnv = rotated.encryptField('nid-under-new-key');
    check('F5b the new writes = under the new kid', newEnv.split(':')[2] === 'kB');
    check('F5c the key count = 2 (the map, not a replacement)', rotated.keyCount() === 2);
  }

  /* F6 — the key contract */
  {
    delete process.env.PAYESH_FIELD_ENC_KEYS;
    delete process.env.PAYESH_FIELD_ENC_KEY;
    const fc = createFieldCrypto(); /* required by default */
    check('F6a no keys = not ready', fc.isReady() === false && fc.activeKid() === null);
    let threw = null;
    try { fc.encryptField('x'); } catch (err) { threw = err; }
    check('F6b the encrypt without keys = KEY_MISSING (fail-closed)', threw && threw.code === 'FIELD_CRYPTO_KEY_MISSING', threw && threw.code);
    const opt = createFieldCrypto({ required: false });
    check('F6c the explicit required=false = the passthrough (the dev opt-in)', opt.encryptField('plain') === 'plain');
  }

  delete process.env.PAYESH_FIELD_ENC_KEYS;
  delete process.env.PAYESH_FIELD_ENC_KID;

  console.log('────────────────────────────────────────────');
  console.log('m15-09-field-crypto: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
