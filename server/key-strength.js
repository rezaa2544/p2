'use strict';
/* ═════════════════════════════════════════════════════════════════
   server/key-strength.js — JWT signing-key strength check (N-06)
   -------------------------------------------------------------------
   The boot gate previously only checked `byteLength(secret) >= 32`. A
   publicly-known placeholder shipped in .env.example
   (`CHANGE_ME__generate_with_openssl_rand_hex_32`, 44 bytes) satisfied that
   check, so an operator who copied the example file got a "valid" signing
   key that anyone could read from the repo — every session token could be
   forged offline.

   A real key must be long AND unpredictable, so this adds:
     1. the original 256-bit length floor,
     2. a denylist of unmistakable placeholder markers,
     3. a cheap entropy floor (distinct characters).

   Returns null when the key is acceptable, or a human-readable reason when
   it must be rotated. Keep the marker list conservative: test fixtures in
   this repo use keys such as "idor-rt-test-secret-..." which are random
   *enough* for a fixture and must keep passing.
   ═════════════════════════════════════════════════════════════════ */

const PLACEHOLDER_MARKERS = [
  'change_me', 'changeme', 'change-me',
  'placeholder', 'example', 'sample_key',
  'replace_me', 'replace-me', 'replaceme',
  'your_secret', 'your-secret', 'your_key', 'your-key',
  'insert_here', 'todo', 'lorem', 'dummy'
];

function weakJwtKeyReason(secret) {
  if (typeof secret !== 'string' || secret.length === 0) return 'missing';
  if (Buffer.byteLength(secret, 'utf8') < 32) return 'shorter than 256 bits (32 bytes)';
  const lower = secret.toLowerCase();
  for (const marker of PLACEHOLDER_MARKERS) {
    if (lower.indexOf(marker) > -1) return 'contains placeholder marker "' + marker + '"';
  }
  /* openssl rand -hex 32 yields ~16 distinct characters; a value built from a
     handful of repeated characters (e.g. 'aaaa…' or 'abcabc…') is not a
     secret even when it is long enough. */
  const distinct = new Set(secret).size;
  if (distinct < 8) return 'only ' + distinct + ' distinct characters — not random';
  return null;
}

module.exports = { weakJwtKeyReason, PLACEHOLDER_MARKERS };
